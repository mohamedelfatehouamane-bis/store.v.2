import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { telegramService } from '@/lib/telegram-service'
import { z } from 'zod'

const withdrawalSchema = z.object({
  amount: z.preprocess((value) => Number(value), z.number().int().positive()),
  payment_name: z.string().trim().min(2).max(120).optional(),
  bank_account_info: z.string().trim().min(5).optional(),
})

function escapeMarkdown(value: string) {
  return value.replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1')
}

async function resolveSellerProfileId(db: any, auth: any) {
  const fromToken = (auth as any).seller_id
  if (fromToken) return String(fromToken)

  const { data: sellerProfile } = await db
    .from('sellers')
    .select('id')
    .eq('user_id', auth.id)
    .maybeSingle()

  return sellerProfile?.id ? String(sellerProfile.id) : null
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth || auth.role !== 'seller') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = supabaseAdmin ?? supabase
    const sellerProfileId = await resolveSellerProfileId(db, auth)
    if (!sellerProfileId) {
      return NextResponse.json({ success: true, withdrawals: [] })
    }

    const url = new URL(request.url)
    const status = url.searchParams.get('status')

    const sellerIdCandidates = Array.from(new Set([auth.id, sellerProfileId].filter(Boolean)))

    let queryBuilder = db
      .from('withdrawals')
      .select('*')
      .in('seller_id', sellerIdCandidates)
      .order('created_at', { ascending: false })

    if (status) {
      queryBuilder = queryBuilder.eq('status', status)
    }

    const { data, error } = await queryBuilder

    if (error) {
      console.error('Get withdrawal requests error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const withdrawals = (data ?? []).map((row: any) => ({
      id: row.id,
      amount: Number(row.amount_requested ?? 0),
      fee_percentage: Number(row.fee_percentage ?? 0),
      final_amount: Number(row.final_amount ?? row.amount_requested ?? 0),
      payment_name: row.payment_name ?? null,
      status: row.status,
      created_at: row.created_at,
      processed_at: null,
      transaction_id: null,
    }))

    return NextResponse.json({ success: true, withdrawals })
  } catch (error) {
    console.error('Get withdrawal requests error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth || auth.role !== 'seller') {
      return NextResponse.json(
        { error: 'Only sellers can request withdrawals' },
        { status: 403 }
      )
    }

    const db = supabaseAdmin ?? supabase
    const sellerProfileId = await resolveSellerProfileId(db, auth)
    if (!sellerProfileId) {
      return NextResponse.json({ error: 'Seller profile not found' }, { status: 404 })
    }

    const body = await request.json()
    const payload = withdrawalSchema.parse(body)

    const { data, error: userError } = await db
      .from('users')
      .select('id, points')
      .eq('id', auth.id)
      .single()

    const user = data as any

    if (userError || !user) {
      console.error('Seller lookup error:', userError)
      return NextResponse.json({ error: 'Seller not found' }, { status: 404 })
    }

    const availablePoints = Number(user.points ?? 0)

    if (payload.amount > availablePoints) {
      return NextResponse.json(
        { error: 'Insufficient points available for withdrawal' },
        { status: 400 }
      )
    }

    const { data: sellerRow } = await db
      .from('sellers')
      .select('fee_percentage')
      .eq('id', sellerProfileId)
      .maybeSingle()

    const withdrawalFeePercentage = Number(sellerRow?.fee_percentage ?? 0)
    const feeAmount = Math.ceil(payload.amount * (withdrawalFeePercentage / 100))
    const finalAmount = Math.max(0, payload.amount - feeAmount)

    const baseInsert = {
      amount_requested: payload.amount,
      fee_percentage: withdrawalFeePercentage,
      final_amount: finalAmount,
      status: 'pending',
      payment_name: payload.payment_name ?? null,
    }

    const attempts = [
      { seller_id: auth.id, ...baseInsert },
      { seller_id: auth.id, ...baseInsert, payment_name: undefined },
      { seller_id: sellerProfileId, ...baseInsert },
      { seller_id: sellerProfileId, ...baseInsert, payment_name: undefined },
    ]

    let newRequest: any = null
    let insertError: any = null
    for (const attempt of attempts) {
      const payloadToInsert: any = { ...attempt }
      if (payloadToInsert.payment_name === undefined) {
        delete payloadToInsert.payment_name
      }

      const result = await (db
        .from('withdrawals') as any)
        .insert([payloadToInsert])
        .select('*')
        .single()

      newRequest = result.data
      insertError = result.error
      if (!insertError && newRequest) {
        break
      }
    }

    if (insertError || !newRequest) {
      console.error('Create withdrawal request error:', insertError)
      return NextResponse.json(
        { error: insertError?.message ?? 'Unable to create withdrawal request' },
        { status: 500 }
      )
    }

    // Notify admin chat in Telegram if configured.
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID
    if (adminChatId) {
      const message = [
        '*💸 New Withdrawal Request*',
        '',
        `🆔 *Request:* \\#${escapeMarkdown(String(newRequest.id))}`,
        `👤 *Seller:* ${escapeMarkdown(String(auth.username ?? auth.id))}`,
        `💰 *Amount:* ${Number(newRequest.amount_requested ?? payload.amount)} points`,
        `📉 *Fee:* ${Number(newRequest.fee_percentage ?? withdrawalFeePercentage)}%`,
        `✅ *Final:* ${Number(newRequest.final_amount ?? finalAmount)} points`,
        `🏦 *Payment:* ${escapeMarkdown(String(newRequest.payment_name ?? payload.payment_name ?? 'N/A'))}`,
        `📌 *Status:* ${escapeMarkdown(String(newRequest.status ?? 'pending'))}`,
      ].join('\n')

      void telegramService.sendMessage(String(adminChatId), message, { parseMode: 'MarkdownV2' }).catch((telegramError) => {
        console.error('Withdrawal created but Telegram admin notification failed:', telegramError)
      })
    }

    return NextResponse.json(
      {
        success: true,
        withdrawal: {
          id: newRequest.id,
          amount: Number(newRequest.amount_requested ?? payload.amount),
          fee_percentage: Number(newRequest.fee_percentage ?? withdrawalFeePercentage),
          final_amount: Number(newRequest.final_amount ?? finalAmount),
          payment_name: newRequest.payment_name ?? payload.payment_name ?? null,
          status: newRequest.status,
          created_at: newRequest.created_at,
          processed_at: null,
          transaction_id: null,
        },
        message: 'Withdrawal request submitted and awaiting approval.',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create withdrawal request error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
