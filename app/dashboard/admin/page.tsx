"use client"

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useSocketConnection } from '@/hooks/useSocketConnection'
import { Loader2 } from 'lucide-react'

type OrderItem = {
  id: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'open'
  product_name?: string
  game_name?: string
  points_price?: number
  customer_name?: string
  assigned_seller_id?: string | null
  created_at?: string
}

type OrderActionEvent = {
  orderId: string
  action: string
  created_at?: string
  userId?: string
  username?: string
}

const STATUS_LABELS: Record<string, string> = {
  all: 'All',
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const ACTION_STATUS_UPDATES: Record<string, OrderItem['status']> = {
  accept_order: 'in_progress',
  complete_order: 'completed',
  cancel_order: 'cancelled',
}

function getStatusBadge(status: OrderItem['status']) {
  switch (status) {
    case 'pending':
      return 'bg-yellow-50 text-yellow-700 border-yellow-200'
    case 'in_progress':
      return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'cancelled':
      return 'bg-red-50 text-red-700 border-red-200'
    case 'open':
      return 'bg-slate-50 text-slate-700 border-slate-200'
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200'
  }
}

function getStatusText(status: OrderItem['status']) {
  return status.replace('_', ' ').replace(/\b\w/g, (chr) => chr.toUpperCase())
}

function formatActionLabel(action: OrderActionEvent) {
  switch (action.action) {
    case 'accept_order':
      return `Order #${action.orderId} accepted`
    case 'complete_order':
      return `Order #${action.orderId} completed`
    case 'cancel_order':
      return `Order #${action.orderId} cancelled`
    case 'report_dispute':
      return `Order #${action.orderId} reported for dispute`
    case 'validate_order':
      return `Order #${action.orderId} validated`
    case 'topup_request':
      return `Order #${action.orderId} requested top-up`
    case 'withdraw_request':
      return `Order #${action.orderId} requested withdrawal`
    default:
      return `Order #${action.orderId} updated`
  }
}

function formatTimestamp(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const connectSocket = useSocketConnection()
  const { user, token, isLoading } = useAuth()
  const [orders, setOrders] = useState<OrderItem[]>([])
  const [actions, setActions] = useState<OrderActionEvent[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed' | 'cancelled'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null)

  useEffect(() => {
    if (isLoading || !user) return
    if (user.role !== 'admin') {
      router.push('/dashboard')
      return
    }

    if (!token) {
      setError('Authentication required')
      setLoading(false)
      return
    }

    let disposed = false
    let socketCleanup: (() => void) | undefined

    async function initializeSocket() {
      setConnectionStatus('connecting')
      const socket = await connectSocket({ path: '/socket.io' })

      if (!socket) {
        if (!disposed) {
          setConnectionStatus('disconnected')
        }
        return
      }

      if (disposed) {
        socket.disconnect()
        return
      }

      const onConnect = () => {
        setConnectionStatus('connected')
        console.debug('[admin socket] connected', socket.id)
      }

      const onConnectError = (err: Error) => {
        setConnectionStatus('disconnected')
        console.error('[admin socket] connect error', err)
      }

      const onOrderAction = (event: OrderActionEvent) => {
        setActions((current) => [...current.slice(-9), event])

        setOrders((current) => {
          const updated = current.map((order) => {
            if (order.id !== event.orderId) return order

            const nextStatus = ACTION_STATUS_UPDATES[event.action]
            return nextStatus ? { ...order, status: nextStatus } : order
          })

          if (current.some((order) => order.id === event.orderId)) {
            setHighlightedOrderId(event.orderId)
          }

          return updated
        })
      }

      const onDisconnect = () => {
        setConnectionStatus('disconnected')
        console.debug('[admin socket] disconnected')
      }

      socket.on('connect', onConnect)
      socket.on('connect_error', onConnectError)
      socket.on('order_action', onOrderAction)
      socket.on('disconnect', onDisconnect)

      socketCleanup = () => {
        socket.off('connect', onConnect)
        socket.off('connect_error', onConnectError)
        socket.off('order_action', onOrderAction)
        socket.off('disconnect', onDisconnect)
        socket.disconnect()
      }
    }

    void initializeSocket()

    return () => {
      disposed = true
      socketCleanup?.()
    }
  }, [connectSocket, isLoading, router, token, user])

  useEffect(() => {
    if (!user) return
    if (!token) {
      setError('Authentication required')
      setLoading(false)
      return
    }

    async function loadOrders() {
      setLoading(true)
      setError('')

      try {
        const response = await fetch('/api/orders', {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!response.ok) {
          throw new Error('Unable to load orders')
        }

        const data = await response.json()
        setOrders(data.orders ?? [])
      } catch (err) {
        console.error(err)
        setError(err instanceof Error ? err.message : 'Failed to load orders')
      } finally {
        setLoading(false)
      }
    }

    void loadOrders()
  }, [token, user])

  useEffect(() => {
    if (!highlightedOrderId) return

    const timer = window.setTimeout(() => {
      setHighlightedOrderId(null)
    }, 3500)

    return () => window.clearTimeout(timer)
  }, [highlightedOrderId])

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'all') {
      return orders
    }

    return orders.filter((order) => order.status === statusFilter)
  }, [orders, statusFilter])

  const stats = useMemo(
    () => ({
      total: orders.length,
      pending: orders.filter((order) => order.status === 'pending').length,
      active: orders.filter((order) => order.status === 'in_progress').length,
      completed: orders.filter((order) => order.status === 'completed').length,
      cancelled: orders.filter((order) => order.status === 'cancelled').length,
    }),
    [orders]
  )

  const connectionStatusLabel = useMemo(() => {
    switch (connectionStatus) {
      case 'connected':
        return '🟢 Connected'
      case 'connecting':
        return '🟡 Connecting'
      case 'disconnected':
        return '🔴 Offline'
      default:
        return '⚪ Unknown'
    }
  }, [connectionStatus])

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Admin Dashboard</h1>
        <p className="text-sm text-slate-600">Live order monitoring and activity tracking for administrators.</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
            {connectionStatusLabel}
          </span>
          <Link href="/dashboard/admin/disputes" className="inline-flex items-center rounded-full bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700">
            Review disputes
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Orders" value={stats.total} />
        <StatCard label="Pending" value={stats.pending} tone="yellow" />
        <StatCard label="In Progress" value={stats.active} tone="blue" />
        <StatCard label="Completed" value={stats.completed} tone="green" />
        <StatCard label="Cancelled" value={stats.cancelled} tone="red" />
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          {(['all', 'pending', 'in_progress', 'completed', 'cancelled'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                statusFilter === status
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
        <div className="text-sm text-slate-500">Showing {filteredOrders.length} orders</div>
      </div>

      {error ? (
        <Card>
          <CardContent className="rounded-lg border border-red-200 bg-red-50 text-red-700">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Live orders</CardTitle>
              <CardDescription>Updates automatically when order actions happen.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((index) => (
                    <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <Skeleton className="h-4 w-1/2 mb-3" />
                      <Skeleton className="h-4 w-3/4 mb-3" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  ))}
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
                  No orders match this filter. Try clearing the selection or checking again later.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredOrders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/dashboard/orders/${order.id}`}
                      className={`block rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm ${
                        highlightedOrderId === order.id
                          ? 'ring-2 ring-sky-400/60 shadow-[0_0_0_1px_rgba(56,189,248,0.4)]'
                          : ''
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm text-slate-500">Order #{order.id}</p>
                          <h3 className="text-lg font-semibold text-slate-900">{order.product_name ?? 'Unknown product'}</h3>
                          <p className="text-sm text-slate-500">{order.game_name ?? 'Unknown game'}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadge(order.status)}`}>
                            {getStatusText(order.status)}
                          </span>
                          {order.points_price !== undefined ? (
                            <span className="text-sm text-slate-600">{order.points_price} pts</span>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Live activity</CardTitle>
              <CardDescription>Latest order actions from the socket stream.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((index) => (
                    <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <Skeleton className="h-4 w-3/4 mb-2" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : actions.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
                  Waiting for order activity...
                </div>
              ) : (
                actions.slice(-10).reverse().map((action, index) => (
                  <div key={`${action.orderId}-${action.action}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-medium text-slate-900">{formatActionLabel(action)}</p>
                      <span className="text-xs text-slate-500">{formatTimestamp(action.created_at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Triggered by {action.username ?? 'system'}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'yellow' | 'blue' | 'green' | 'red' }) {
  const toneStyles: Record<string, string> = {
    slate: 'border-slate-200 bg-white text-slate-900',
    yellow: 'border-yellow-200 bg-yellow-50 text-yellow-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    red: 'border-red-200 bg-red-50 text-red-800',
  }

  return (
    <Card>
      <CardContent className={`rounded-3xl border p-6 ${toneStyles[tone]}`}>
        <div className="text-3xl font-semibold">{value}</div>
        <div className="mt-2 text-sm uppercase tracking-[0.18em] text-slate-500">{label}</div>
      </CardContent>
    </Card>
  )
}
