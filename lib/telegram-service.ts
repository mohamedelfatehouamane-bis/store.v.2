type TelegramSendMessageOptions = {
  parseMode?: 'HTML' | 'MarkdownV2'
  disableWebPreview?: boolean
  replyMarkup?: Record<string, unknown>
}

type TelegramResult = {
  sent: boolean
  reason?: string
}

function getBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN || ''
}

const MIN_CHAT_INTERVAL_MS = 250
const RETRYABLE_ERROR_CODES = ['429', '500', '502', '503', '504']
const lastMessageAtByChat = new Map<string, number>()

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeChatId(chatId: string | number | null | undefined): string | null {
  if (chatId === null || chatId === undefined) return null

  const value = String(chatId).trim()
  if (!value) return null

  // Telegram chat/user IDs are integer-like values (groups can be negative).
  if (!/^-?\d{5,20}$/.test(value)) return null

  return value
}

async function callTelegram(method: string, payload: Record<string, unknown>) {
  const token = getBotToken()
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is missing')
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.ok) {
    throw new Error(`Telegram ${method} failed: ${response.status} ${JSON.stringify(body)}`)
  }

  return body.result
}

async function sendMessage(
  chatId: string | number | null | undefined,
  message: string,
  options: TelegramSendMessageOptions = {}
): Promise<TelegramResult> {
  const normalizedChatId = normalizeChatId(chatId)
  if (!normalizedChatId || !message?.trim()) {
    return { sent: false, reason: 'invalid_chat_or_message' as const }
  }

  const lastSentAt = lastMessageAtByChat.get(normalizedChatId) ?? 0
  const now = Date.now()
  const waitFor = Math.max(0, MIN_CHAT_INTERVAL_MS - (now - lastSentAt))
  if (waitFor > 0) {
    await sleep(waitFor)
  }

  try {
    await callTelegram('sendMessage', {
      chat_id: normalizedChatId,
      text: message,
      parse_mode: options.parseMode ?? 'HTML',
      disable_web_page_preview: options.disableWebPreview ?? true,
      ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
    })
    lastMessageAtByChat.set(normalizedChatId, Date.now())
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error)
    const shouldRetry = RETRYABLE_ERROR_CODES.some((code) => messageText.includes(code))

    if (shouldRetry) {
      try {
        await sleep(350)
        await callTelegram('sendMessage', {
          chat_id: normalizedChatId,
          text: message,
          parse_mode: options.parseMode ?? 'HTML',
          disable_web_page_preview: options.disableWebPreview ?? true,
          ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
        })
        lastMessageAtByChat.set(normalizedChatId, Date.now())
        return { sent: true as const }
      } catch (retryError) {
        console.error('[TelegramService] sendMessage retry failed:', retryError instanceof Error ? retryError.message : String(retryError))
        return { sent: false, reason: 'telegram_api_error' }
      }
    }

    console.error('[TelegramService] sendMessage failed:', messageText)
    return { sent: false, reason: 'telegram_api_error' }
  }

  return { sent: true as const }
}

async function answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
  return callTelegram('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
    show_alert: showAlert,
  })
}

async function editMessageReplyMarkup(chatId: string | number, messageId: number, inlineKeyboard: unknown[] = []) {
  return callTelegram('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: {
      inline_keyboard: inlineKeyboard,
    },
  })
}

async function editMessageText(chatId: string | number, messageId: number, text: string) {
  return callTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
  })
}

async function editMessageCaption(chatId: string | number, messageId: number, caption: string) {
  return callTelegram('editMessageCaption', {
    chat_id: chatId,
    message_id: messageId,
    caption,
    parse_mode: 'HTML',
  })
}

function orderCreatedMessage(orderId: string) {
  return [
    '✅ Order Created',
    `ID: #${orderId}`,
    'Status: Pending',
  ].join('\n')
}

function orderUpdatedMessage(orderId: string, status: string) {
  return [
    `🔄 Order #${orderId}`,
    `Status: ${status}`,
  ].join('\n')
}

function pointsTransactionMessage(change: number, totalPoints: number) {
  const sign = change >= 0 ? '+' : ''
  return [
    '💰 Points Update',
    `Change: ${sign}${change}`,
    `Total: ${totalPoints}`,
  ].join('\n')
}

function sellerAssignedMessage(orderId: string, productName: string, customerUsername: string) {
  return [
    '📦 New Order',
    `Order ID: #${orderId}`,
    `Product: ${productName}`,
    `Customer: ${customerUsername}`,
  ].join('\n')
}

export const telegramService = {
  sendMessage,
  callTelegram,
  answerCallbackQuery,
  editMessageReplyMarkup,
  editMessageText,
  editMessageCaption,
  isValidChatId: (chatId: string | number | null | undefined) => Boolean(normalizeChatId(chatId)),
  orderCreatedMessage,
  orderUpdatedMessage,
  pointsTransactionMessage,
  sellerAssignedMessage,
}
