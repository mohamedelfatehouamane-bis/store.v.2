'use client'

import { useEffect, useState } from 'react'

import Link from 'next/link'

import { useAuth } from '@/lib/auth-context'

import {
  normalizeStatus,
  ORDER_STATUS,
} from '@/lib/order-status'

import {
  Card,
  CardContent,
} from '@/components/ui/card'

import { Button } from '@/components/ui/button'

import { Input } from '@/components/ui/input'

import { Skeleton } from '@/components/ui/skeleton'

import {
  Search,
  Filter,
  ShoppingBag,
  Wallet,
  Package,
  Users,
  ClipboardList,
} from 'lucide-react'

type OrderItem = {
  id: string
  product_name: string
  game_name: string
  category_name?: string
  status: string
  points_amount: number
  assigned_seller_id?: string | null
  created_at: string
}

function getStatusColor(
  status: string
) {
  switch (status) {
    case ORDER_STATUS.PENDING:
      return 'bg-yellow-50 text-yellow-700 border-yellow-200'

    case ORDER_STATUS.IN_PROGRESS:
      return 'bg-blue-50 text-blue-700 border-blue-200'

    case ORDER_STATUS.COMPLETED:
      return 'bg-green-50 text-green-700 border-green-200'

    case ORDER_STATUS.CANCELLED:
      return 'bg-red-50 text-red-700 border-red-200'

    default:
      return 'bg-slate-50 text-slate-700 border-slate-200'
  }
}

function getStatusLabel(
  status: string
) {
  return status
    .replace('_', ' ')
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase()
    )
}

export default function OrdersPage() {
  const { user } =
    useAuth()

  const [orders, setOrders] =
    useState<OrderItem[]>([])

  const [
    searchQuery,
    setSearchQuery,
  ] = useState('')

  const [
    statusFilter,
    setStatusFilter,
  ] = useState('all')

  const [loading, setLoading] =
    useState(false)

  const [error, setError] =
    useState('')

  const orderFilter =
    user?.role === 'seller'
      ? 'my-tasks'
      : user?.role ===
          'customer'
        ? 'my-orders'
        : ''

  useEffect(() => {
    if (!user) return

    const token =
      localStorage.getItem(
        'auth_token'
      )

    if (!token) {
      setError(
        'Authentication required'
      )

      return
    }

    async function loadOrders() {
      try {
        setLoading(true)

        setError('')

        const params =
          new URLSearchParams()

        if (orderFilter) {
          params.append(
            'filter',
            orderFilter
          )
        }

        if (
          statusFilter !== 'all'
        ) {
          params.append(
            'status',
            statusFilter
          )
        }

        const response =
          await fetch(
            `/api/orders?${params.toString()}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          )

        const data =
          await response.json()

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Failed to load orders'
          )
        }

        setOrders(
          (
            data.orders ?? []
          ).map((order: any) => ({
            ...order,

            status:
              normalizeStatus(
                order.status
              ),
          }))
        )
      } catch (err) {
        console.error(err)

        setError(
          err instanceof Error
            ? err.message
            : 'Failed to fetch orders'
        )
      } finally {
        setLoading(false)
      }
    }

    loadOrders()
  }, [
    user,
    orderFilter,
    statusFilter,
  ])

  const filteredOrders =
    orders.filter((order) =>
      `${order.product_name} ${order.game_name} ${order.category_name ?? ''}`
        .toLowerCase()
        .includes(
          searchQuery.toLowerCase()
        )
    )

  const progressWidth = (
    status: string
  ) => {
    switch (status) {
      case ORDER_STATUS.COMPLETED:
        return '100%'

      case ORDER_STATUS.IN_PROGRESS:
        return '60%'

      case ORDER_STATUS.PENDING:
        return '20%'

      default:
        return '0%'
    }
  }

  return (
    <div className="flex-1 px-4 py-6">
      {/* HEADER */}

      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            Orders
          </h1>

          <p className="text-slate-500">
            Manage your orders
          </p>
        </div>

        {/* CUSTOMER */}

        {user?.role ===
          'customer' && (
          <div className="flex gap-3">
            <Link href="/dashboard/marketplace">
              <Button className="gap-2">
                <ShoppingBag size={18} />

                Browse Shop
              </Button>
            </Link>

            <Link href="/dashboard/topup">
              <Button
                variant="outline"
                className="gap-2"
              >
                <Wallet size={18} />

                Top Up Points
              </Button>
            </Link>
          </div>
        )}

        {/* SELLER */}

        {user?.role ===
          'seller' && (
          <div className="flex gap-3">
            <Link href="/dashboard/orders/available">
              <Button className="gap-2">
                <Package size={18} />

                Available Orders
              </Button>
            </Link>

            <Link href="/dashboard/withdraw">
              <Button
                variant="outline"
                className="gap-2"
              >
                <Wallet size={18} />

                Withdraw
              </Button>
            </Link>
          </div>
        )}

        {/* ADMIN */}

        {user?.role ===
          'admin' && (
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/admin/users">
              <Button className="gap-2">
                <Users size={18} />

                Users
              </Button>
            </Link>

            <Link href="/dashboard/admin/orders">
              <Button
                variant="outline"
                className="gap-2"
              >
                <ClipboardList size={18} />

                Orders
              </Button>
            </Link>

            <Link href="/dashboard/admin/withdrawals">
              <Button
                variant="outline"
                className="gap-2"
              >
                <Wallet size={18} />

                Withdrawals
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* SEARCH */}

      <div className="mb-6 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

          <Input
            placeholder="Search orders..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) =>
              setSearchQuery(
                e.target.value
              )
            }
          />
        </div>

        <Button
          variant="outline"
          className="gap-2"
        >
          <Filter size={18} />

          Filter
        </Button>
      </div>

      {/* FILTERS */}

      <div className="mb-6 flex gap-2 overflow-x-auto border-b pb-2">
        {[
          'all',
          'pending',
          'in_progress',
          'completed',
        ].map((status) => (
          <button
            key={status}
            onClick={() =>
              setStatusFilter(
                status
              )
            }
            className={`rounded px-4 py-2 text-sm ${
              statusFilter ===
              status
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100'
            }`}
          >
            {getStatusLabel(
              status
            )}
          </button>
        ))}
      </div>

      {/* ERROR */}

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {/* CONTENT */}

      <div className="space-y-4">
        {loading ? (
          [1, 2, 3].map(
            (item) => (
              <Card key={item}>
                <CardContent className="space-y-4 p-6">
                  <Skeleton className="h-4 w-1/2" />

                  <Skeleton className="h-4 w-full" />

                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            )
          )
        ) : filteredOrders.length >
          0 ? (
          filteredOrders.map(
            (order) => (
              <Card
                key={order.id}
              >
                <CardContent className="p-6">
                  <div className="grid gap-4 md:grid-cols-5">
                    <div>
                      <p className="text-xs text-slate-500">
                        {
                          order.game_name
                        }
                      </p>

                      <h3 className="font-semibold">
                        {
                          order.product_name
                        }
                      </h3>

                      {order.category_name && (
                        <p className="text-sm text-slate-500">
                          {
                            order.category_name
                          }
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Price
                      </p>

                      <p className="font-bold">
                        {
                          order.points_amount
                        }{' '}
                        pts
                      </p>
                    </div>

                    <div>
                      <div className="h-2 rounded-full bg-slate-200">
                        <div
                          className="h-2 rounded-full bg-blue-600"
                          style={{
                            width:
                              progressWidth(
                                order.status
                              ),
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <span
                        className={`rounded border px-2 py-1 text-xs ${getStatusColor(order.status)}`}
                      >
                        {getStatusLabel(
                          order.status
                        )}
                      </span>
                    </div>

                    <div>
                      <Link
                        href={`/dashboard/orders/${order.id}`}
                      >
                        <Button
                          variant="outline"
                          className="w-full"
                        >
                          View
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          )
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="mb-4 text-slate-500">
                No orders found
              </p>

              {user?.role ===
                'customer' && (
                <Link href="/dashboard/marketplace">
                  <Button>
                    Browse Shop
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
