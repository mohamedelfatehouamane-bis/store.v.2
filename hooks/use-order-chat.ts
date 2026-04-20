import { useEffect, useState, useCallback, useRef } from 'react'
import { Socket } from 'socket.io-client'
import { useSocketConnection } from '@/hooks/useSocketConnection'

// ✅ REQUIRED EXPORTS (fix your build error)
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

export function useOrderChat(orderId: string | null, token: string | null) {
  const connectSocket = useSocketConnection()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)

  const socketRef = useRef<Socket | null>(null)

  // ✅ Safe JSON parser
  const parseResponseJson = useCallback(async (response: Response) => {
    const text = await response.text()
    if (!text) return {}

    try {
      return JSON.parse(text)
    } catch {
      throw new Error('Invalid JSON response')
    }
  }, [])

  // ✅ FIXED FETCH
  const fetchMessages = useCallback(async () => {
    if (!orderId || !token) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')

      const API = process.env.NEXT_PUBLIC_API_URL

      if (!API) {
        console.error("❌ API URL missing")
        setError("API not configured")
        return
      }

      const response = await fetch(`${API}/api/orders/${orderId}/messages`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await parseResponseJson(response)

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load messages')
      }

      setMessages(data.messages || [])

    } catch (err) {
      console.error("Fetch error:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [orderId, token, parseResponseJson])

  // ✅ Initial load
  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  // ✅ Socket connection
  useEffect(() => {
    if (!orderId || !token) return

    let socket: Socket | null = null

    async function initSocket() {
      const s = await connectSocket()

      if (!s) return

      socket = s
      socketRef.current = socket

      socket.on("connect", () => {
        console.log("✅ Socket connected")
        setConnected(true)
        socket.emit("join_order", orderId)
      })

      socket.on("disconnect", () => {
        console.log("❌ Socket disconnected")
        setConnected(false)
      })

      socket.on("new_message", (msg: ChatMessage) => {
        setMessages((prev) => [...prev, msg])
      })

      socket.on("connect_error", (err) => {
        console.error("Socket error:", err)
      })
    }

    initSocket()

    return () => {
      if (socket) {
        socket.disconnect()
      }
    }
  }, [orderId, token, connectSocket])

  return {
    messages,
    loading,
    error,
    connected,
  }
}
