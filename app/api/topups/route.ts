import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { ensureBucket, sanitizeStorageFileName } from '@/lib/storage'
import { telegramService } from '@/lib/telegram-service'
import { z } from 'zod'

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const PRICE_PER_POINT_DZD = 1
const MIN_TOPUP_POINTS = 100
const MAX_TOPUP_POINTS = 200000
const TOPUP_COOLDOWN_MS = 2 * 60 * 1000
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const topupFormSchema = z.object({
  payment_method_id: z.string().trim().regex(UUID_PATTERN, 'Invalid payment method'),
  payment_account_id: z.string().trim().regex(UUID_PATTERN, 'Invalid payment account').optional(),
  amount_points: z.number().int().min(MIN_TOPUP_POINTS).max(MAX_TOPUP_POINTS),
  transaction_reference: z.string().trim().min(3).max(120).optional(),
})

function getImageExtension(file: File): string {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/gif') return 'gif'
  return 'jpg'
}

async function notifyAdminViaTelegram(payload: {
  adminChatId: string
  topupId: string
  username: string
  amountPoints: number
  paymentMethodDisplayName: string
  proofUrl: string
  transactionReference: string | null
}) {
  const telegramText =
    `💰 <b>New Top-up Request</b>\n\n` +
    `👤 User: <b>${payload.username}</b>\n` +
    `🧾 Top-up ID: <code>${payload.topupId}</code>\n` +
    `💎 Amount: <b>${payload.amountPoints.toLocaleString()} points</b>\n` +
    `💳 Method: <b>${payload.paymentMethodDisplayName}</b>\n` +
    (payload.transactionReference ? `🔖 Reference: <code>${payload.transactionReference}</code>\n` : '') +
    `\n<a href="${payload.proofUrl}">📎 View Receipt</a>`

  void telegramService
    .sendMessage(payload.adminChatId, telegramText, {
      parseMode: 'HTML',
      disableWebPreview: false,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `topup_approve:${payload.topupId}` },
            { text: '❌ Reject', callback_data: `topup_reject:${payload.topupId}` },
          ],
        ],
      },
    })
    .catch((err) => {
      console.error('Top-up admin Telegram notify failed:', err)
    })
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const status = url.searchParams.get('status')

    const withAllOptionalFields = await supabase
      .from('point_topups')
      .select('id, user_id, amount_points, proof_image, status, created_at, payment_method, payment_account_name, payment_account_number, transaction_reference, rejection_reason')
      .eq('user_id', auth.id)
      .order('created_at', { ascending: false })

    const withMethodFields = withAllOptionalFields.error?.code === '42703'
      ? await supabase
          .from('point_topups')
          .select('id, user_id, amount_points, proof_image, status, created_at, payment_method')
          .eq('user_id', auth.id)
          .order('created_at', { ascending: false })
      : withAllOptionalFields

    const fallback = withMethodFields.error?.code === '42703'
      ? await supabase
          .from('point_topups')
          .select('id, user_id, amount_points, proof_image, status, created_at')
          .eq('user_id', auth.id)
          .order('created_at', { ascending: false })
      : withMethodFields

    const { data, error } = fallback
    const filteredData = status
      ? (data ?? []).filter((topup: any) => topup.status === status)
      : (data ?? [])

    if (error) {
      console.error('Get top-up requests error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const topups = filteredData.map((topup: any) => ({
      ...topup,
      amount: Number(topup.amount_points ?? 0),
      currency: 'DZD',
      payment_method: topup.payment_method ?? null,
      total_dzd: Number(topup.amount_points ?? 0) * PRICE_PER_POINT_DZD,
    }))

    return NextResponse.json({ success: true, topups })
  } catch (error) {
    console.error('Get top-up requests error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

type PaymentMethodRow = {
  id: string
  name: string
  display_name: string
}

type PaymentMethodAccountRow = {
  id: string
  account_number: string
  account_name: string
  is_active: boolean
  usage_count?: number | null
  priority?: number | null
  last_used?: string | null
}

function pickSafestAccount(accounts: PaymentMethodAccountRow[]): PaymentMethodAccountRow | null {
  if (accounts.length === 0) return null

  return [...accounts].sort((a, b) => {
    const usageA = Number(a.usage_count ?? 0)
    const usageB = Number(b.usage_count ?? 0)
    const priorityA = Math.max(1, Number(a.priority ?? 1))
    const priorityB = Math.max(1, Number(b.priority ?? 1))

    const scoreA = usageA / priorityA
    const scoreB = usageB / priorityB
    if (scoreA !== scoreB) return scoreA - scoreB

    const usedAtA = a.last_used ? new Date(a.last_used).getTime() : 0
    const usedAtB = b.last_used ? new Date(b.last_used).getTime() : 0
    if (usedAtA !== usedAtB) return usedAtA - usedAtB

    return a.id.localeCompare(b.id)
  })[0]
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth || auth.role !== 'customer') {
      return NextResponse.json(
        { error: 'Only customers can request top-ups' },
        { status: 403 }
      )
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server misconfiguration', message: 'Top-up service is not configured' },
        { status: 500 }
      )
    }

    const adminClient = supabaseAdmin

    try {
      await ensureBucket(adminClient, 'topups', '5MB')
    } catch (bucketError) {
      console.error('Top-up storage bucket error:', bucketError)
      return NextResponse.json(
        { error: bucketError instanceof Error ? bucketError.message : 'Unable to prepare top-up storage bucket' },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const paymentMethodIdRaw = String(formData.get('payment_method_id') || '').trim()
    const paymentAccountIdRaw = String(formData.get('payment_account_id') || '').trim() || undefined
    const amountPointsRaw = Number(formData.get('amount_points'))
    const transactionReferenceRaw = formData.get('transaction_reference')
    const transactionReferenceNormalized = transactionReferenceRaw
      ? String(transactionReferenceRaw).trim().slice(0, 120)
      : undefined
    const proof = formData.get('proof_image')

    let parsedForm: z.infer<typeof topupFormSchema>
    try {
      parsedForm = topupFormSchema.parse({
        payment_method_id: paymentMethodIdRaw,
        payment_account_id: paymentAccountIdRaw,
        amount_points: amountPointsRaw,
        transaction_reference: transactionReferenceNormalized,
      })
    } catch (validationError: unknown) {
      if (validationError instanceof z.ZodError) {
        return NextResponse.json(
          { error: validationError.errors[0]?.message || 'Invalid top-up payload' },
          { status: 400 }
        )
      }

      return NextResponse.json({ error: 'Invalid top-up payload' }, { status: 400 })
    }

    const paymentMethodId = parsedForm.payment_method_id
    const paymentAccountId = parsedForm.payment_account_id ?? null
    const amountPoints = parsedForm.amount_points
    const transactionReference = parsedForm.transaction_reference ?? null

    if (!(proof instanceof File)) {
      return NextResponse.json(
        { error: 'Payment proof image is required' },
        { status: 400 }
      )
    }

    if (!ALLOWED_IMAGE_TYPES.has(proof.type)) {
      return NextResponse.json(
        { error: 'Only JPG, PNG, WEBP, or GIF images are allowed' },
        { status: 400 }
      )
    }

    if (proof.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'Image size must be 5MB or less' },
        { status: 400 }
      )
    }

    const { data: method, error: methodError } = await supabase
      .from('payment_methods')
      .select('id, name, display_name')
      .eq('id', paymentMethodId)
      .eq('is_active', true)
      .maybeSingle()

    if (methodError || !method) {
      return NextResponse.json(
        { error: 'Selected payment method is not available' },
        { status: 400 }
      )
    }

    const { data: methodAccounts, error: methodAccountsError } = await supabase
      .from('payment_method_accounts')
      .select('id, account_number, account_name, is_active, usage_count, priority, last_used')
      .eq('payment_method_id', paymentMethodId)
      .eq('is_active', true)

    if (methodAccountsError) {
      return NextResponse.json(
        { error: 'Unable to validate payment account' },
        { status: 500 }
      )
    }

    if (!methodAccounts || methodAccounts.length === 0) {
      return NextResponse.json(
        { error: 'No active payment account is available for this method' },
        { status: 400 }
      )
    }

    let selectedAccount = paymentAccountId
      ? (methodAccounts as PaymentMethodAccountRow[]).find((account) => account.id === paymentAccountId)
      : pickSafestAccount(methodAccounts as PaymentMethodAccountRow[])

    if (paymentAccountId && !selectedAccount) {
      return NextResponse.json(
        { error: 'Selected payment account is not available for this method' },
        { status: 400 }
      )
    }

    if (!selectedAccount) {
      return NextResponse.json(
        { error: 'No active payment account is available for this method' },
        { status: 400 }
      )
    }

    const { data: pendingTopups, error: pendingError } = await supabase
      .from('point_topups')
      .select('id')
      .eq('user_id', auth.id)
      .eq('status', 'pending')
      .limit(1)

    if (pendingError) {
      console.error('Pending top-up check error:', pendingError)
      return NextResponse.json(
        { error: 'Unable to validate existing requests' },
        { status: 500 }
      )
    }

    if ((pendingTopups ?? []).length > 0) {
      return NextResponse.json(
        { error: 'You already have a pending top-up request' },
        { status: 409 }
      )
    }

    if (transactionReference) {
      const { data: duplicateReferenceRows, error: duplicateReferenceError } = await supabase
        .from('point_topups')
        .select('id')
        .eq('user_id', auth.id)
        .eq('transaction_reference', transactionReference)
        .in('status', ['pending', 'approved'])
        .limit(1)

      if (!duplicateReferenceError && (duplicateReferenceRows ?? []).length > 0) {
        return NextResponse.json(
          { error: 'This transaction reference was already used for another top-up request' },
          { status: 409 }
        )
      }
    }

    const { data: recentTopups, error: recentTopupsError } = await supabase
      .from('point_topups')
      .select('created_at')
      .eq('user_id', auth.id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (recentTopupsError) {
      console.error('Recent top-up cooldown check error:', recentTopupsError)
      return NextResponse.json(
        { error: 'Unable to validate top-up cooldown' },
        { status: 500 }
      )
    }

    const latestTopup = ((recentTopups ?? []) as Array<{ created_at: string }>)[0]
    if (latestTopup?.created_at) {
      const elapsedMs = Date.now() - new Date(latestTopup.created_at).getTime()
      if (elapsedMs < TOPUP_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((TOPUP_COOLDOWN_MS - elapsedMs) / 1000)
        return NextResponse.json(
          {
            error: `Please wait ${retryAfterSeconds} seconds before submitting another top-up request`,
            retry_after: retryAfterSeconds,
          },
          { status: 429 }
        )
      }
    }

    const extension = getImageExtension(proof)
    const baseName = sanitizeStorageFileName(proof.name.replace(/\.[^.]+$/, ''))
    const fileName = `${baseName}.${extension}`
    const storagePath = `topups/${Date.now()}-${fileName}`
    const bytes = await proof.arrayBuffer()
    const proofBytes = Buffer.from(bytes)

    const { error: uploadError } = await adminClient.storage
      .from('topups')
      .upload(storagePath, proofBytes, {
        contentType: proof.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Top-up proof upload error:', uploadError)
      return NextResponse.json(
        { error: uploadError.message || 'Unable to upload proof image' },
        { status: 500 }
      )
    }

    const { data: publicUrlData } = adminClient.storage
      .from('topups')
      .getPublicUrl(storagePath)

    const basePayload: Record<string, any> = {
      user_id: auth.id,
      amount_points: amountPoints,
      proof_image: publicUrlData.publicUrl,
      status: 'pending',
    }

    const richestPayload: Record<string, any> = {
      ...basePayload,
      payment_method: (method as PaymentMethodRow).name,
      payment_method_id: (method as PaymentMethodRow).id,
      payment_account_id: selectedAccount.id,
      payment_account_number: selectedAccount.account_number,
      payment_account_name: selectedAccount.account_name,
    }

    if (transactionReference) {
      richestPayload.transaction_reference = transactionReference
    }

    const fallbackPayload: Record<string, any> = {
      ...basePayload,
      payment_method: (method as PaymentMethodRow).name,
    }

    if (transactionReference) {
      fallbackPayload.transaction_reference = transactionReference
    }

    const payloadCandidates = [richestPayload, fallbackPayload, basePayload]
    let lastInsertError: any = null
    let insertedData: any = null

    for (const payload of payloadCandidates) {
      const insertResult = await adminClient
        .from('point_topups')
        .insert(payload)
        .select('id, user_id, amount_points, proof_image, status, created_at')
        .single()

      if (!insertResult.error && insertResult.data) {
        insertedData = insertResult.data
        break
      }

      lastInsertError = insertResult.error
      const isColumnError =
        insertResult.error?.code === '42703' ||
        insertResult.error?.message?.toLowerCase().includes('schema cache') ||
        insertResult.error?.message?.toLowerCase().includes('column')
      if (!isColumnError) {
        break
      }
    }

    if (lastInsertError && !insertedData) {
      console.error('Create top-up request error:', lastInsertError)
      return NextResponse.json(
        { error: lastInsertError.message ?? 'Unable to create top-up request' },
        { status: 500 }
      )
    }

    const nextUsageCount = Number((selectedAccount as PaymentMethodAccountRow).usage_count ?? 0) + 1

    let usageUpdateResult = await adminClient
      .from('payment_method_accounts')
      .update({ usage_count: nextUsageCount, last_used: new Date().toISOString() })
      .eq('id', selectedAccount.id)

    if (usageUpdateResult.error?.code === '42703') {
      usageUpdateResult = await adminClient
        .from('payment_method_accounts')
        .update({ usage_count: nextUsageCount })
        .eq('id', selectedAccount.id)
    }

    if (usageUpdateResult.error) {
      console.error('Payment account usage update error:', usageUpdateResult.error)
    }

    const transactionPayload = {
      user_id: auth.id,
      amount: amountPoints,
      reference_id: insertedData.id,
      type: 'topup',
      status: 'pending',
    }

    let transactionCreateResult = await adminClient
      .from('point_transactions')
      .insert(transactionPayload)

    if (transactionCreateResult.error?.code === '42703') {
      transactionCreateResult = await adminClient
        .from('point_transactions')
        .insert({
          user_id: auth.id,
          amount: amountPoints,
          reference_id: insertedData.id,
          type: 'topup',
        })
    }

    if (transactionCreateResult.error) {
      console.error('Top-up transaction pending record error:', transactionCreateResult.error)
    }

    // Send Telegram message to admin
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID
    if (adminChatId) {
      const proofUrl = insertedData.proof_image ?? publicUrlData.publicUrl
      notifyAdminViaTelegram({
        adminChatId,
        topupId: String(insertedData.id),
        username: auth.username,
        amountPoints,
        paymentMethodDisplayName: (method as PaymentMethodRow).display_name,
        proofUrl,
        transactionReference,
      }).catch((err: any) => {
        console.warn('Telegram notification warning:', err instanceof Error ? err.message : String(err))
      })
    }

    return NextResponse.json(
      {
        success: true,
        topup: {
          ...insertedData,
          amount: Number(insertedData.amount_points ?? 0),
          currency: 'DZD',
          payment_method: (method as PaymentMethodRow).name,
          transaction_reference: transactionReference,
          total_dzd: Number(insertedData.amount_points ?? 0) * PRICE_PER_POINT_DZD,
        },
        selected_account: {
          id: selectedAccount.id,
          account_number: selectedAccount.account_number,
          account_name: selectedAccount.account_name,
        },
        message: 'Top-up request submitted and awaiting approval.',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create top-up request error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
