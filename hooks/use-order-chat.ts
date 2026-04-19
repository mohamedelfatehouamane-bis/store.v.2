import { useEffect, useState, useCallback, useRef } from 'react'
import { Socket } from 'socket.io-client'
import { useSocketConnection } from '@/hooks/useSocketConnection'


export interface ChatMessage {
  id: string
  content: string
  created_at: string
  sender: {
    username: string
    avatar_url?: string | null
  }
}

export const ORDER_ACTIONS = {
  ACCEPT_ORDER: 'accept_order',
  COMPLETE_ORDER: 'complete_order',
  CANCEL_ORDER: 'cancel_order',
  REPORT_DISPUTE: 'report_dispute',
  VALIDATE_ORDER: 'validate_order',
  TOPUP_REQUEST: 'topup_request',
  WITHDRAW_REQUEST: 'withdraw_request',
} as const

export type OrderActionType = (typeof ORDER_ACTIONS)[keyof typeof ORDER_ACTIONS]

export interface OrderActionEvent {
  orderId: string
  action: OrderActionType
  data?: unknown
  userId: string
  username: string
  created_at?: string
}

export function useOrderChat(orderId: string | null, token: string | null) {
  const connectSocket = useSocketConnection()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chatAvailable, setChatAvailable] = useState(true)
  const [connected, setConnected] = useState(false)
  const [typingUsers, setTypingUsers] = useState<{ userId: string; username: string }[]>([])
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([])
  const [orderActions, setOrderActions] = useState<OrderActionEvent[]>([])
  const [seenInfo, setSeenInfo] = useState<{ userId: string; lastReadMessageId: string }[]>([])
  const socketRef = useRef<Socket | null>(null)
  const messagesSnapshotRef = useRef('')
  const hasConnectedRef = useRef(false)
  const typingTimeoutsRef = useRef<Map<string, number>>(new Map())
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('disconnected')
  const [queuedMessageCount, setQueuedMessageCount] = useState(0)
  const queuedMessagesRef = useRef<
    Array<{
      content: string
      resolve: (message: ChatMessage | null) => void
      reject: (reason?: unknown) => void
      timeoutId: number
    }>
  >([])
  // Throttle: track when we last emitted 'typing' so we don't spam the server
  // on every keystroke.  Emit immediately on first keystroke, then suppress
  // for TYPING_THROTTLE_MS.  This keeps latency at zero while bounding load.
  const lastTypingSentRef = useRef(0)
  const TYPING_THROTTLE_MS = 500
  // Dedup: only emit 'mark_seen' when the seen message id actually changes.
  const lastSeenIdRef = useRef('')

  const parseResponseJson = useCallback(async (response: Response) => {
    const rawBody = await response.text()
    if (!rawBody) {
      return {}
    }

    try {
      return JSON.parse(rawBody)
    } catch {
      const preview = rawBody.slice(0, 120).replace(/\s+/g, ' ').trim()
      throw new Error(`Unexpected server response: ${preview || 'non-JSON body'}`)
    }
  }, [])

  const fetchMessages = useCallback(async (options?: { silent?: boolean }) => {
    if (!orderId || !token) {
      setLoading(false)
      return
    }

    const silent = options?.silent ?? false

    try {
      if (!silent) {
        setLoading(true)
      }

      setError('')
      setChatAvailable(true)
      const response = await fetch(`/api/orders/${orderId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      const data = await parseResponseJson(response)
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to load messages')
      }

      if (data.chat_configured === false) {
        setChatAvailable(false)
        setError('Order chat is not configured yet. Please contact support.')
      }

      const nextMessages = data.messages ?? []
      const nextSnapshot = JSON.stringify(nextMessages)
      if (messagesSnapshotRef.current !== nextSnapshot) {
        messagesSnapshotRef.current = nextSnapshot
        setMessages(nextMessages)
      }
    } catch (err) {
      console.error('Fetch messages error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load messages')
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [orderId, token, parseResponseJson])

  const upsertMessage = useCallback((nextMessage: ChatMessage) => {
    setMessages((current) => {
      const existingIndex = current.findIndex((message) => message.id === nextMessage.id)
      const nextMessages =
        existingIndex === -1
          ? [...current, nextMessage]
          : current.map((message, index) => (index === existingIndex ? nextMessage : message))

      nextMessages.sort((a, b) => {
        const left = Date.parse(a.created_at)
        const right = Date.parse(b.created_at)

        if (Number.isNaN(left) || Number.isNaN(right)) {
          return 0
        }

        return left - right
      })

      messagesSnapshotRef.current = JSON.stringify(nextMessages)
      return nextMessages
    })
  }, [])

  const waitForSocketConnection = useCallback(async (socket: Socket) => {
    if (socket.connected) return socket
    socket.connect()

    return await new Promise<Socket>((resolve, reject) => {
      const timeoutMs = 5000
      let timeoutId: number | null = null

      const onConnect = () => {
        cleanup()
        resolve(socket)
      }

      const onConnectError = (error: Error | string) => {
        cleanup()
        reject(error instanceof Error ? error : new Error(String(error)))
      }

      const cleanup = () => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId)
          timeoutId = null
        }
        socket.off('connect', onConnect)
        socket.off('connect_error', onConnectError)
        socket.off('connect_timeout', onConnectError)
      }

      timeoutId = window.setTimeout(() => {
        cleanup()
        reject(new Error('Chat connection timed out'))
      }, timeoutMs)

      socket.on('connect', onConnect)
      socket.on('connect_error', onConnectError)
      socket.on('connect_timeout', onConnectError)
    })
  }, [])

  const failQueuedMessages = useCallback(
    (error: Error) => {
      const queuedMessages = queuedMessagesRef.current.splice(0)
      setQueuedMessageCount(0)
      queuedMessages.forEach((queuedMessage) => {
        window.clearTimeout(queuedMessage.timeoutId)
        queuedMessage.reject(error)
      })
    },
    []
  )

  const emitSendMessage = useCallback(
    (socket: Socket, content: string) => {
      return new Promise<ChatMessage | null>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          reject(new Error('Message send timeout'))
        }, 10000)

        socket.emit(
          'send_message',
          { orderId, message: content.trim() },
          (response?: {
            success?: boolean
            error?: string
            code?: string
            message?: ChatMessage
          }) => {
            window.clearTimeout(timeout)

            if (!response?.success) {
              if (response?.code === 'CHAT_NOT_CONFIGURED') {
                const knownMessage = response.error || 'Order chat is not configured yet. Please contact support.'
                setChatAvailable(false)
                setError(knownMessage)
                reject(new Error(knownMessage))
                return
              }

              reject(new Error(response?.error || 'Unable to send message'))
              return
            }

            setError('')

            if (response.message) {
              upsertMessage(response.message)
            }

            resolve(response.message ?? null)
          }
        )
      })
    },
    [orderId, upsertMessage]
  )

  const flushQueuedMessages = useCallback(
    async (socket: Socket) => {
      if (!socket.connected || queuedMessagesRef.current.length === 0) return

      const queuedMessages = queuedMessagesRef.current.splice(0)
      setQueuedMessageCount(0)

      for (const queuedMessage of queuedMessages) {
        window.clearTimeout(queuedMessage.timeoutId)
        try {
          const message = await emitSendMessage(socket, queuedMessage.content)
          queuedMessage.resolve(message)
        } catch (flushError) {
          queuedMessage.reject(flushError)
        }
      }
    },
    [emitSendMessage]
  )

  // Initial fetch when entering the order chat.
  useEffect(() => {
    fetchMessages()

    return () => {
      socketRef.current = null
    }
  }, [orderId, fetchMessages])

  useEffect(() => {
    if (!orderId || !token || !chatAvailable) return

    let disposed = false
    let socket: Socket | undefined

    const onJoin = (response?: {
      success?: boolean
      error?: string
      code?: string
      onlineUserIds?: string[]
    }) => {
      if (response?.success) {
        setError('')
        if (Array.isArray(response.onlineUserIds)) {
          setOnlineUserIds(response.onlineUserIds)
        }
        if (socket) {
          void flushQueuedMessages(socket)
        }
        return
      }

      if (response?.code === 'CHAT_NOT_CONFIGURED') {
        const knownMessage = response.error || 'Order chat is not configured yet. Please contact support.'
        setChatAvailable(false)
        setError(knownMessage)
        return
      }

      if (response?.error) {
        setError(response.error)
      }
    }

    const onConnect = () => {
      if (!socket) return
      console.debug('[socket] connected', socket.id)
      setSocketStatus('connected')
      socket.emit('join_order', orderId, onJoin)
      setConnected(true)
      if (hasConnectedRef.current) {
        // Re-joined after a disconnect — fetch messages missed while offline
        void fetchMessages({ silent: true })
      }
      hasConnectedRef.current = true
    }

    const onConnectError = (connectError: Error) => {
      console.error('[socket] connect_error', connectError)
      setSocketStatus('disconnected')
      const message = connectError.message || 'Unable to connect to chat server'
      setError(message.toLowerCase().includes('unauthorized') ? 'Socket authentication failed. Please sign in again.' : message)
    }

    const onReconnectAttempt = () => {
      setSocketStatus('reconnecting')
    }

    const onReconnectError = (reconnectError: Error) => {
      setError(reconnectError.message || 'Reconnection attempt failed')
    }

    const onReconnectFailed = () => {
      setSocketStatus('disconnected')
      setError('Unable to re-establish chat connection')
    }

    const onServerError = (payload: { error?: string; code?: string }) => {
      if (payload?.code === 'CHAT_NOT_CONFIGURED') {
        const knownMessage = payload.error || 'Order chat is not configured yet. Please contact support.'
        setChatAvailable(false)
        setError(knownMessage)
        return
      }

      if (payload?.error) {
        setError(payload.error)
      }
    }

    const onDisconnect = () => {
      setSocketStatus('disconnected')
      setConnected(false)
      setTypingUsers([])
    }

    const onNewMessage = (incomingMessage: ChatMessage) => {
      upsertMessage(incomingMessage)
      setError('')
    }

    const onUserOnline = ({ userId }: { userId: string }) => {
      setOnlineUserIds((current) => (current.includes(userId) ? current : [...current, userId]))
    }

    const onUserOffline = ({ userId }: { userId: string }) => {
      setOnlineUserIds((current) => current.filter((id) => id !== userId))
    }

    const onTyping = ({ userId, username }: { userId: string; username: string }) => {
      setTypingUsers((current) => {
        if (current.some((u) => u.userId === userId)) return current
        return [...current, { userId, username }]
      })

      const existing = typingTimeoutsRef.current.get(userId)
      if (existing !== undefined) window.clearTimeout(existing)

      const t = window.setTimeout(() => {
        setTypingUsers((current) => current.filter((u) => u.userId !== userId))
        typingTimeoutsRef.current.delete(userId)
      }, 4500)

      typingTimeoutsRef.current.set(userId, t)
    }

    const onTypingStop = ({ userId }: { userId: string }) => {
      setTypingUsers((current) => current.filter((u) => u.userId !== userId))
      const existing = typingTimeoutsRef.current.get(userId)
      if (existing !== undefined) {
        window.clearTimeout(existing)
        typingTimeoutsRef.current.delete(userId)
      }
    }

    const onOrderAction = (event: OrderActionEvent) => {
      setOrderActions((current) => [
        ...current.slice(-19),
        event,
      ])
    }

    const onMessagesSeen = ({
      userId,
      lastReadMessageId,
    }: {
      userId: string
      lastReadMessageId: string
    }) => {
      setSeenInfo((current) => {
        const idx = current.findIndex((s) => s.userId === userId)
        if (idx === -1) return [...current, { userId, lastReadMessageId }]
        return current.map((s, i) => (i === idx ? { userId, lastReadMessageId } : s))
      })
    }

    async function initializeSocket() {
      setSocketStatus('connecting')
      const nextSocket = await connectSocket({
        path: '/socket.io',
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      })

      if (!nextSocket) {
        if (!disposed) {
          setSocketStatus('disconnected')
          setConnected(false)
        }
        return
      }

      if (disposed) {
        nextSocket.disconnect()
        return
      }

      socket = nextSocket
      socketRef.current = socket
      socket.on('connect', onConnect)
      socket.on('connect_error', onConnectError)
      socket.on('disconnect', onDisconnect)
      socket.on('error', onServerError)
      socket.on('new_message', onNewMessage)
      socket.on('user_online', onUserOnline)
      socket.on('user_offline', onUserOffline)
      socket.on('typing', onTyping)
      socket.on('typing_stop', onTypingStop)
      socket.on('messages_seen', onMessagesSeen)
      socket.on('order_action', onOrderAction)
      socket.on('reconnect_attempt', onReconnectAttempt)
      socket.on('reconnect_error', onReconnectError)
      socket.on('reconnect_failed', onReconnectFailed)
    }

    void initializeSocket()

    return () => {
      disposed = true
      if (!socket) return
      typingTimeoutsRef.current.forEach((t) => {
        window.clearTimeout(t)
      })
      typingTimeoutsRef.current.clear()

      socket.emit('leave_order', orderId)
      socket.off('connect', onConnect)
      socket.off('connect_error', onConnectError)
      socket.off('disconnect', onDisconnect)
      socket.off('error', onServerError)
      socket.off('new_message', onNewMessage)
      socket.off('user_online', onUserOnline)
      socket.off('user_offline', onUserOffline)
      socket.off('typing', onTyping)
      socket.off('typing_stop', onTypingStop)
      socket.off('messages_seen', onMessagesSeen)
      socket.off('order_action', onOrderAction)
      socket.off('reconnect_attempt', onReconnectAttempt)
      socket.off('reconnect_error', onReconnectError)
      socket.off('reconnect_failed', onReconnectFailed)
      failQueuedMessages(new Error('Chat session ended before pending messages could be sent'))
      socket.disconnect()
      hasConnectedRef.current = false
      lastTypingSentRef.current = 0
      lastSeenIdRef.current = ''

      if (socketRef.current === socket) {
        socketRef.current = null
      }
    }
  }, [chatAvailable, connectSocket, fetchMessages, orderId, token, upsertMessage])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!orderId || !token) {
        throw new Error('Order or auth missing')
      }

      if (!chatAvailable) {
        const knownMessage = 'Order chat is not configured yet. Please contact support.'
        setError(knownMessage)
        return null
      }

      const socket = socketRef.current
      if (!socket) {
        throw new Error('Chat server is not connected')
      }

      if (socket.connected) {
        return await emitSendMessage(socket, content)
      }

      try {
        await waitForSocketConnection(socket)
        if (socket.connected) {
          return await emitSendMessage(socket, content)
        }
      } catch {
        // Fall through to queue while reconnect completes.
      }

      return await new Promise<ChatMessage | null>((resolve, reject) => {
        const queuedMessage = {
          content,
          resolve,
          reject,
          timeoutId: 0 as number,
        }

        queuedMessage.timeoutId = window.setTimeout(() => {
          const index = queuedMessagesRef.current.findIndex((item) => item === queuedMessage)
          if (index !== -1) {
            queuedMessagesRef.current.splice(index, 1)
            setQueuedMessageCount(queuedMessagesRef.current.length)
          }
          reject(new Error('Queued message timeout'))
        }, 30000)

        queuedMessagesRef.current.push(queuedMessage)
        setQueuedMessageCount(queuedMessagesRef.current.length)
        setError('Message queued until chat reconnects')
      })
    },
    [chatAvailable, emitSendMessage, orderId, token, waitForSocketConnection]
  )

  const sendTyping = useCallback(() => {
    const socket = socketRef.current
    if (!socket || !socket.connected || !orderId) return
    const now = Date.now()
    if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return
    lastTypingSentRef.current = now
    socket.emit('typing', { orderId })
  }, [orderId, TYPING_THROTTLE_MS])

  const sendOrderAction = useCallback(
    async (action: string, data?: unknown) => {
      if (!orderId || !token) {
        throw new Error('Order or auth missing')
      }

      const socket = socketRef.current
      if (!socket) {
        throw new Error('Chat server is not connected')
      }

      if (!socket.connected) {
        try {
          await waitForSocketConnection(socket)
        } catch {
          throw new Error('Chat server is not connected')
        }
      }

      return await new Promise<{ success: boolean; error?: string }>((resolve, reject) => {
        socket.emit(
          'order_action',
          { orderId, action, data },
          (response?: { success?: boolean; error?: string }) => {
            if (!response?.success) {
              reject(new Error(response?.error || 'Unable to perform action'))
              return
            }

            resolve({ success: true, error: response.error })
          }
        )
      })
    },
    [orderId, token, waitForSocketConnection]
  )

  const markSeen = useCallback(
    (lastReadMessageId: string) => {
      const socket = socketRef.current
      if (!socket || !socket.connected || !orderId || !lastReadMessageId) return
      if (lastReadMessageId === lastSeenIdRef.current) return
      lastSeenIdRef.current = lastReadMessageId
      socket.emit('mark_seen', { orderId, lastReadMessageId })
    },
    [orderId]
  )

  useEffect(() => {
    if (!connected || messages.length === 0) return
    markSeen(messages[messages.length - 1].id)
  }, [connected, markSeen, messages])

  return {
    messages,
    loading,
    error,
    chatAvailable,
    connected,
    socketStatus,
    queuedMessageCount,
    typingUsers,
    onlineUserIds,
    orderActions,
    seenInfo,
    sendMessage,
    sendOrderAction,
    sendTyping,
    markSeen,
  }
}
