import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL

export const ORDER_ACTIONS = {
  ACCEPT_ORDER: 'accept_order',
  COMPLETE_ORDER: 'complete_order',
  CANCEL_ORDER: 'cancel_order',
  REPORT_DISPUTE: 'report_dispute',
  VALIDATE_ORDER: 'validate_order',
  TOPUP_REQUEST: 'topup_request',
  WITHDRAW_REQUEST: 'withdraw_request',
} as const

export type OrderActionType =
  (typeof ORDER_ACTIONS)[keyof typeof ORDER_ACTIONS]

export interface OrderActionEvent {
  orderId: string
  action: OrderActionType
  data?: unknown
  userId: string
  username: string
  created_at?: string
}

export interface ChatMessage {
  id: string
  content: string
  created_at: string
  sender: {
    username: string
    avatar_url?: string | null
  }
}

type SocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export function useOrderChat(orderId: string | null, token: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chatAvailable, setChatAvailable] = useState(true)
  const [connected, setConnected] = useState(false)
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('disconnected')
  const [typingUsers, setTypingUsers] = useState<{ userId: string; username: string }[]>([])
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([])
  const [orderActions, setOrderActions] = useState<OrderActionEvent[]>([])
  // No client-side message queue is implemented; kept for API compatibility with the page component.
  const queuedMessageCount = 0

  const socketRef = useRef<Socket | null>(null)

  // Fetch messages from the built-in Next.js API route (relative URL)
  const fetchMessages = useCallback(async () => {
    if (!orderId || !token) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')

      const response = await fetch(`/api/orders/${orderId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      const text = await response.text()
      let data: Record<string, unknown> = {}
      if (text) {
        try {
          data = JSON.parse(text)
        } catch {
          throw new Error('Invalid JSON response from messages API')
        }
      }

      if (!response.ok || !data.success) {
        throw new Error((data.error as string) || 'Failed to load messages')
      }

      setChatAvailable(data.chat_configured !== false)
      setMessages((data.messages as ChatMessage[]) ?? [])
    } catch (err) {
      console.error('[Chat] Fetch messages error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [orderId, token])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  // Socket connection using the custom JWT token passed in from localStorage
  useEffect(() => {
    if (!orderId || !token) return

    if (!SOCKET_URL) {
      console.error('[Socket] Missing NEXT_PUBLIC_SOCKET_URL')
      return
    }

    setSocketStatus('connecting')

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      setSocketStatus('connected')
      socket.emit('join_order', orderId, (ack: { success?: boolean; onlineUserIds?: string[]; error?: string }) => {
        if (ack?.error) {
          console.error('[Socket] join_order failed:', ack.error)
          return
        }
        if (ack?.onlineUserIds) {
          setOnlineUserIds(ack.onlineUserIds)
        }
      })
    })

    socket.on('disconnect', () => {
      setConnected(false)
      setSocketStatus('disconnected')
    })

    socket.on('connect_error', (err) => {
      console.error('[Socket] connect_error:', err)
      setSocketStatus('disconnected')
    })

    socket.io.on('reconnect_attempt', () => {
      setSocketStatus('reconnecting')
    })

    socket.on('new_message', (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg])
    })

    socket.on('order_action', (event: OrderActionEvent) => {
      setOrderActions((prev) => [...prev, event])
    })

    socket.on('typing', ({ userId, username }: { userId: string; username: string }) => {
      setTypingUsers((prev) =>
        prev.some((u) => u.userId === userId) ? prev : [...prev, { userId, username }]
      )
    })

    socket.on('typing_stop', ({ userId }: { userId: string }) => {
      setTypingUsers((prev) => prev.filter((u) => u.userId !== userId))
    })

    socket.on('user_online', ({ userId }: { userId: string }) => {
      setOnlineUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]))
    })

    socket.on('user_offline', ({ userId }: { userId: string }) => {
      setOnlineUserIds((prev) => prev.filter((id) => id !== userId))
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [orderId, token])

  const sendMessage = useCallback(
    async (content: string): Promise<ChatMessage | null> => {
      const socket = socketRef.current
      if (!socket || !orderId) return null

      return new Promise((resolve) => {
        socket.emit(
          'send_message',
          { orderId, message: content },
          (ack: { success: boolean; message?: ChatMessage; error?: string }) => {
            if (ack?.success && ack.message) {
              resolve(ack.message)
            } else {
              console.error('[Chat] Send message failed:', ack?.error)
              resolve(null)
            }
          }
        )
      })
    },
    [orderId]
  )

  const sendOrderAction = useCallback(
    async (action: OrderActionType, data?: unknown): Promise<void> => {
      const socket = socketRef.current
      if (!socket || !orderId) return

      return new Promise((resolve, reject) => {
        socket.emit(
          'order_action',
          { orderId, action, data },
          (ack: { success: boolean; error?: string }) => {
            if (ack?.success) {
              resolve()
            } else {
              reject(new Error(ack?.error || 'Failed to send order action'))
            }
          }
        )
      })
    },
    [orderId]
  )

  const sendTyping = useCallback(() => {
    const socket = socketRef.current
    if (!socket || !orderId) return
    socket.emit('typing', { orderId })
  }, [orderId])

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
    sendMessage,
    sendOrderAction,
    sendTyping,
  }
}
