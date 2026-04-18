import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { telegramService } from '@/lib/telegram-service'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type TelegramCallbackQuery = {
  id?: string
  data?: string
  from?: {
    id?: number
    username?: string
  }
  message?: {
    message_id?: number
    text?: string
    caption?: string
    photo?: Array<unknown>
    chat?: {
      id?: number
    }
  }
}

function escapeHtml(value: unknown) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isIgnorableTelegramError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  return (
    lower.includes('query is too old') ||
    lower.includes('query id is invalid') ||
    lower.includes('message is not modified') ||
    lower.includes('operation was aborted') ||
    lower.includes('timeout')
  )
}

async function answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
  return telegramService.answerCallbackQuery(callbackQueryId, text, showAlert)
}

async function safeAnswerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
  try {
    await answerCallbackQuery(callbackQueryId, text, showAlert)
  } catch (error) {
    if (isIgnorableTelegramError(error)) {
      console.warn('[Telegram][Webhook] Callback ack skipped (non-fatal):', error instanceof Error ? error.message : String(error))
      return
    }

    throw error
  }
}

async function safeEditMessageReplyMarkup(chatId: string | number, messageId: number, inlineKeyboard: unknown[] = []) {
  try {
    await editMessageReplyMarkup(chatId, messageId, inlineKeyboard)
  } catch (error) {
    if (isIgnorableTelegramError(error)) {
      console.warn('[Telegram][Webhook] editMessageReplyMarkup skipped (non-fatal):', error instanceof Error ? error.message : String(error))
      return
    }
    throw error
  }
}

async function safeEditMessageText(chatId: string | number, messageId: number, text: string) {
  try {
    await editMessageText(chatId, messageId, text)
  } catch (error) {
    if (isIgnorableTelegramError(error)) {
      console.warn('[Telegram][Webhook] editMessageText skipped (non-fatal):', error instanceof Error ? error.message : String(error))
      return
    }
    throw error
  }
}

async function safeEditMessageCaption(chatId: string | number, messageId: number, caption: string) {
  try {
    await editMessageCaption(chatId, messageId, caption)
  } catch (error) {
    if (isIgnorableTelegramError(error)) {
      console.warn('[Telegram][Webhook] editMessageCaption skipped (non-fatal):', error instanceof Error ? error.message : String(error))
      return
    }
    throw error
  }
}

async function sendMessage(chatId: string | number, text: string) {
  return telegramService.sendMessage(chatId, text, { parseMode: 'HTML', disableWebPreview: true })
}

async function editMessageReplyMarkup(chatId: string | number, messageId: number, inlineKeyboard: unknown[] = []) {
  return telegramService.editMessageReplyMarkup(chatId, messageId, inlineKeyboard)
}

async function editMessageText(chatId: string | number, messageId: number, text: string) {
  return telegramService.editMessageText(chatId, messageId, text)
}

async function editMessageCaption(chatId: string | number, messageId: number, caption: string) {
  return telegramService.editMessageCaption(chatId, messageId, caption)
}

function parseTopupAction(callbackData: string) {
  const match = /^topup_(approve|reject):(.+)$/.exec(callbackData || '')
  if (!match) return null
  return {
    action: match[1],
    topupId: match[2],
  }
}

function parseOrderAction(callbackData: string) {
  const scopedMatch = /^order_(accept|reject):(.+)$/.exec(callbackData || '')
  if (scopedMatch) {
    return {
      action: scopedMatch[1],
      orderId: scopedMatch[2],
    }
  }

  const simpleMatch = /^(accept|reject)_(.+)$/.exec(callbackData || '')
  if (simpleMatch) {
    return {
      action: simpleMatch[1],
      orderId: simpleMatch[2],
    }
  }

  return null
}

function normalizeOrderStatusForDisplay(status: string) {
  if (status === 'open') return 'pending'
  if (status === 'accepted') return 'in_progress'
  return status
}

async function handleStartLinking(update: any) {
  const messageText = String(update?.message?.text || '').trim()
  const chatId = update?.message?.chat?.id
  const username = update?.message?.from?.username

  if (!messageText.toLowerCase().startsWith('/start') || !chatId) {
    return false
  }

  const parts = messageText.split(/\s+/)
  const token = parts[1]?.trim()

  if (!token) {
    await sendMessage(
      chatId,
      'Send this command from your account dashboard to link your account.'
    )
    return true
  }

  if (!supabaseAdmin) {
    await sendMessage(chatId, 'Server misconfigured. Please try again later.')
    return true
  }

  const { data: user, error: findError } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('telegram_link_token', token)
    .maybeSingle()

  if (findError) {
    console.error('[Telegram][Webhook] Link lookup error:', findError)
    await sendMessage(chatId, 'Linking failed. Please generate a new code and try again.')
    return true
  }

  if (!user) {
    await sendMessage(chatId, 'Invalid or expired code. Generate a new code from your dashboard.')
    return true
  }

  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      telegram_id: String(chatId),
      telegram_username: username ? String(username) : null,
      telegram_link_token: null,
    })
    .eq('id', user.id)

  if (updateError) {
    console.error('[Telegram][Webhook] Link update error:', updateError)
    await sendMessage(chatId, 'Failed to save Telegram link. Please try again.')
    return true
  }

  await sendMessage(chatId, '✅ Your account has been successfully linked!')
  return true
}

async function getSellerByTelegramChatId(chatId: string) {
  if (!supabaseAdmin) return null

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, role, username, points, balance')
    .eq('telegram_id', chatId)
    .maybeSingle()

  if (error || !user || user.role !== 'seller') {
    return null
  }

  return user
}

async function getSellerByTelegramUserId(telegramUserId: string) {
  if (!supabaseAdmin) return null

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, role, username, telegram_id')
    .eq('telegram_id', telegramUserId)
    .maybeSingle()

  if (error || !user || user.role !== 'seller') {
    return null
  }

  return user
}

async function logOrderAction(input: {
  orderId: string
  sellerId: string
  action: 'accept' | 'reject'
  result: string
  details?: Record<string, unknown>
}) {
  if (!supabaseAdmin) return

  const { error } = await supabaseAdmin
    .from('order_logs')
    .insert({
      order_id: input.orderId,
      seller_id: input.sellerId,
      action: input.action,
      result: input.result,
      details: input.details ?? null,
    })

  if (error) {
    console.warn('[Telegram][Webhook] order_logs insert skipped:', error.message)
  }
}

async function handleSellerCommand(update: any) {
  const text = String(update?.message?.text || '').trim()
  const chatIdValue = update?.message?.chat?.id
  if (!text.startsWith('/') || !chatIdValue) {
    return false
  }

  const chatId = String(chatIdValue)

  if (text === '/start') {
    await sendMessage(chatId, 'Welcome! To connect your seller account, use Connect Telegram in dashboard and open the generated link.')
    return true
  }

  if (!['/orders', '/balance', '/help'].includes(text)) {
    return false
  }

  const seller = await getSellerByTelegramChatId(chatId)
  if (!seller) {
    await sendMessage(chatId, 'Account not linked. Use Connect Telegram in dashboard then open the generated bot link.')
    return true
  }

  if (text === '/help') {
    await sendMessage(
      chatId,
      [
        '<b>Commands</b>',
        '/orders - View your latest orders',
        '/balance - View your points balance',
        '/help - Show available commands',
      ].join('\n')
    )
    return true
  }

  if (text === '/balance') {
    const points = Number((seller as any).points ?? (seller as any).balance ?? 0)
    await sendMessage(chatId, `💰 <b>Your Balance:</b> ${escapeHtml(points)} points`)
    return true
  }

  if (text === '/orders') {
    const { data: orders, error } = await supabaseAdmin!
      .from('orders')
      .select(
        `
        id,
        status,
        created_at,
        points_amount,
        offer:offer_id(name),
        exclusive_offer:exclusive_offer_id(name)
      `
      )
      .eq('assigned_seller_id', seller.id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('[Telegram][Webhook] /orders query error:', error)
      await sendMessage(chatId, 'Unable to load orders right now. Try again later.')
      return true
    }

    if (!orders || orders.length === 0) {
      await sendMessage(chatId, '📦 <b>Your Orders:</b>\n\nNo assigned orders yet.')
      return true
    }

    const lines = orders.map((order: any) => {
      const orderName = order.offer?.name || order.exclusive_offer?.name || 'Order'
      const displayStatus = normalizeOrderStatusForDisplay(String(order.status || 'unknown'))
      return `#${escapeHtml(order.id)} - ${escapeHtml(orderName)} - ${escapeHtml(displayStatus)}`
    })

    await sendMessage(chatId, ['📦 <b>Your Orders:</b>', '', ...lines].join('\n'))
    return true
  }

  return false
}

async function editCallbackMessageStatus(callbackQuery: TelegramCallbackQuery, statusText: string) {
  const chatId = callbackQuery.message?.chat?.id
  const messageId = callbackQuery.message?.message_id
  if (!chatId || !messageId) return

  const originalText = callbackQuery.message?.text || callbackQuery.message?.caption || ''
  const nextText = `${statusText}\n\n${originalText}`.slice(0, 4000)

  await safeEditMessageReplyMarkup(chatId, messageId, [])

  if ((callbackQuery.message?.photo ?? []).length > 0) {
    await safeEditMessageCaption(chatId, messageId, nextText)
  } else {
    await safeEditMessageText(chatId, messageId, nextText)
  }
}

async function replaceOrderMessage(callbackQuery: TelegramCallbackQuery, nextText: string) {
  const chatId = callbackQuery.message?.chat?.id
  const messageId = callbackQuery.message?.message_id
  if (!chatId || !messageId) return

  await safeEditMessageReplyMarkup(chatId, messageId, [])

  if ((callbackQuery.message?.photo ?? []).length > 0) {
    await safeEditMessageCaption(chatId, messageId, nextText.slice(0, 1024))
  } else {
    await safeEditMessageText(chatId, messageId, nextText.slice(0, 4000))
  }
}

export async function POST(request: NextRequest) {
  let callbackQueryId: string | null = null
  try {
    const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (configuredSecret) {
      const incomingSecret = request.headers.get('x-telegram-bot-api-secret-token')
      if (incomingSecret !== configuredSecret) {
        return NextResponse.json({ success: false, message: 'Invalid webhook secret.' }, { status: 401 })
      }
    }

    const update = await request.json()
    console.log('[Telegram][Webhook] Incoming update:', JSON.stringify(update))

    const linked = await handleStartLinking(update)
    if (linked) {
      return NextResponse.json({ success: true, message: 'Linking message handled.' })
    }

    const commandHandled = await handleSellerCommand(update)
    if (commandHandled) {
      return NextResponse.json({ success: true, message: 'Command handled.' })
    }

    const callbackQuery: TelegramCallbackQuery | undefined = update?.callback_query
    if (!callbackQuery) {
      return NextResponse.json({ success: true, message: 'No callback query in this update.' })
    }

    callbackQueryId = String(callbackQuery.id || '') || null
    const callbackData = String(callbackQuery.data || '')
    console.log('[Telegram][Webhook] Callback received:', callbackData)

    if (!callbackQuery.id) {
      return NextResponse.json({ success: true, message: 'Missing callback id.' })
    }

    if (process.env.TELEGRAM_CALLBACK_DEBUG_ECHO === 'true') {
      await safeAnswerCallbackQuery(callbackQuery.id, 'Button works ✅', false)
      await editCallbackMessageStatus(callbackQuery, '🧪 Debug: Button works ✅')
      return NextResponse.json({ success: true, message: 'Debug callback echo sent.' })
    }

    const topupAction = parseTopupAction(callbackData)
    if (topupAction) {
      await safeAnswerCallbackQuery(callbackQuery.id, '⏳ Processing...', false)

      if (!supabaseAdmin) {
        await editCallbackMessageStatus(callbackQuery, '⚠️ Server Misconfigured')
        return NextResponse.json({ success: true, message: 'Server misconfigured' })
      }

      if (!UUID_PATTERN.test(topupAction.topupId)) {
        await safeAnswerCallbackQuery(callbackQuery.id, 'Invalid top-up ID.', true)
        await editCallbackMessageStatus(callbackQuery, '⚠️ Invalid Top-Up ID')
        return NextResponse.json({ success: true, message: 'Invalid top-up ID.' })
      }

      const adminTelegramId = String(callbackQuery.from?.id || 'unknown')
      const rpc = await supabaseAdmin.rpc('process_topup_admin_action', {
        p_topup_id: topupAction.topupId,
        p_action: topupAction.action === 'approve' ? 'approve' : 'reject',
        p_admin_telegram_id: adminTelegramId,
      })

      if (rpc.error) {
        console.error('[Telegram][Webhook] Top-up RPC error:', rpc.error.message)
        await editCallbackMessageStatus(callbackQuery, '⚠️ Processing Failed')
        return NextResponse.json({ success: true, message: 'RPC error' })
      }

      const result: any = rpc.data || {}
      const success = Boolean(result.success ?? result.ok)
      if (!success) {
        const status = String(result.status || 'processed')
        await editCallbackMessageStatus(
          callbackQuery,
          status === 'approved' ? '✅ Approved' : status === 'rejected' ? '❌ Rejected' : `ℹ️ ${status}`
        )
        return NextResponse.json({ success: true, message: result.message || `Top-up ${status}` })
      }

      const resolvedStatus = String(result.status || (topupAction.action === 'approve' ? 'approved' : 'rejected'))
      const topupId = String(result.topup_id || topupAction.topupId)
      const amountPoints = Number(result.amount_points || 0)
      const userTelegramId = result.user_telegram_id ? String(result.user_telegram_id) : null

      if (userTelegramId) {
        const text =
          resolvedStatus === 'approved'
            ? [
                '<b>✅ Top-Up Approved</b>',
                `Top-Up ID: <code>${escapeHtml(topupId)}</code>`,
                `Amount Added: <b>${escapeHtml(amountPoints)}</b> points`,
              ].join('\n')
            : [
                '<b>❌ Top-Up Rejected</b>',
                `Top-Up ID: <code>${escapeHtml(topupId)}</code>`,
                'Your top-up request was rejected.',
              ].join('\n')

        try {
          await sendMessage(userTelegramId, text)
        } catch (notifyError) {
          console.warn('[Telegram][Webhook] User notify skipped (non-fatal):', notifyError instanceof Error ? notifyError.message : String(notifyError))
        }
      }

      await editCallbackMessageStatus(
        callbackQuery,
        resolvedStatus === 'approved' ? '✅ Approved' : '❌ Rejected'
      )

      return NextResponse.json({ success: true, message: `Top-up ${resolvedStatus}.` })
    }

    const orderAction = parseOrderAction(callbackData)
    if (orderAction) {
      await safeAnswerCallbackQuery(callbackQuery.id, '⏳ Processing...', false)

      if (!supabaseAdmin) {
        await editCallbackMessageStatus(callbackQuery, '⚠️ Server Misconfigured')
        return NextResponse.json({ success: true, message: 'Server misconfigured' })
      }

      // Keep order workflow aligned with dashboard/delivery routes.
      const nextStatus = orderAction.action === 'accept' ? 'in_progress' : 'rejected'

      const callbackUserId = String(callbackQuery.from?.id || '')
      if (!callbackUserId) {
        await safeAnswerCallbackQuery(callbackQuery.id, 'Invalid Telegram user.', true)
        return NextResponse.json({ success: true, message: 'Missing callback user id.' })
      }

      const sellerUser = await getSellerByTelegramUserId(callbackUserId)
      if (!sellerUser) {
        await safeAnswerCallbackQuery(
          callbackQuery.id,
          '❌ You are not a registered seller. Use /start CODE first.',
          true
        )
        return NextResponse.json({ success: true, message: 'Seller mapping not found.' })
      }

      const sellerName = String(sellerUser.username || callbackQuery.from?.username || 'seller')

      if (orderAction.action === 'reject') {
        await logOrderAction({
          orderId: orderAction.orderId,
          sellerId: String(sellerUser.id),
          action: 'reject',
          result: 'ignored',
          details: {
            reason: 'seller_declined',
            telegram_user_id: callbackUserId,
          },
        })

        await safeAnswerCallbackQuery(
          callbackQuery.id,
          'Noted. Order remains available for other sellers.',
          false
        )

        try {
          await sendMessage(
            callbackUserId,
            `ℹ️ You declined order #${escapeHtml(orderAction.orderId)}. It remains open for other sellers.`
          )
        } catch (messageError) {
          console.warn('[Telegram][Webhook] Private decline confirmation skipped:', messageError instanceof Error ? messageError.message : String(messageError))
        }

        return NextResponse.json({ success: true, message: 'Reject acknowledged without changing order state.' })
      }

      const updated = await supabaseAdmin
        .from('orders')
        .update({
          status: nextStatus,
          assigned_seller_id: sellerUser.id,
          assigned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderAction.orderId)
        .eq('status', 'open')
        .select('id, status')
        .maybeSingle()

      if (updated.error) {
        await logOrderAction({
          orderId: orderAction.orderId,
          sellerId: String(sellerUser.id),
          action: 'accept',
          result: 'db_error',
          details: { error: updated.error.message },
        })
        console.error('[Telegram][Webhook] Order update error:', updated.error)
        await editCallbackMessageStatus(callbackQuery, '⚠️ Order Update Failed')
        return NextResponse.json({ success: true, message: 'Order update failed.' })
      }

      if (!updated.data) {
        await logOrderAction({
          orderId: orderAction.orderId,
          sellerId: String(sellerUser.id),
          action: 'accept',
          result: 'already_taken',
        })
        await safeAnswerCallbackQuery(callbackQuery.id, '❌ Order already taken', true)
        await replaceOrderMessage(
          callbackQuery,
          `⛔ ALREADY TAKEN\n\nOrder #${escapeHtml(orderAction.orderId)}`
        )
        return NextResponse.json({ success: true, message: 'Order already taken.' })
      }

      await logOrderAction({
        orderId: orderAction.orderId,
        sellerId: String(sellerUser.id),
        action: 'accept',
        result: 'claimed',
        details: { assigned_at: new Date().toISOString() },
      })

      await replaceOrderMessage(
        callbackQuery,
        `✅ TAKEN by ${escapeHtml(sellerName)}\n\nOrder #${escapeHtml(updated.data.id)}`
      )

      const customerLookup = await supabaseAdmin
        .from('orders')
        .select('customer_id')
        .eq('id', updated.data.id)
        .maybeSingle()

      if (customerLookup.data?.customer_id) {
        const customerUser = await supabaseAdmin
          .from('users')
          .select('telegram_id')
          .eq('id', customerLookup.data.customer_id)
          .maybeSingle()

        if (customerUser.data?.telegram_id) {
          try {
            await sendMessage(
              String(customerUser.data.telegram_id),
              [`🔄 Order #${updated.data.id} updated`, 'Status: in_progress'].join('\n')
            )
          } catch (notifyError) {
            console.warn('[Telegram][Webhook] Customer status update skipped:', notifyError instanceof Error ? notifyError.message : String(notifyError))
          }
        }
      }

      await safeAnswerCallbackQuery(
        callbackQuery.id,
        `You accepted order #${updated.data.id}`,
        false
      )

      try {
        await sendMessage(
          callbackUserId,
          `✅ You accepted order #${escapeHtml(updated.data.id)}`
        )
      } catch (messageError) {
        console.warn('[Telegram][Webhook] Private confirmation skipped:', messageError instanceof Error ? messageError.message : String(messageError))
      }

      return NextResponse.json({ success: true, message: 'Order accepted.' })
    }

    await safeAnswerCallbackQuery(callbackQuery.id, 'Unsupported action.', false)
    return NextResponse.json({ success: true, message: 'Unsupported callback data.' })
  } catch (error: any) {
    if (callbackQueryId) {
      try {
        await safeAnswerCallbackQuery(callbackQueryId, '⚠️ Error occurred', true)
      } catch {
        // no-op
      }
    }

    console.error('[Telegram][Webhook] Callback processing failed:', error?.message || String(error))
    return NextResponse.json({ success: false, message: 'Callback handled with warnings.' })
  }
}
