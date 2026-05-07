'use client'

import { useEffect, useState } from 'react'

import Link from 'next/link'

import { useAuth } from '@/lib/auth-context'

import {
  normalizeStatus,
  ORDER_STATUS,
} from '@/lib/order-status'

import { useLanguage } from '@/lib/language-context'

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

    case ORDER_STATUS.DELIVERED:
      return 'bg-slate-50 text-slate-700 border-slate-200'

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

  const { t } =
    useLanguage()

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
      setLoading(true)

      setError('')

      try {
        const query =
          orderFilter
            ? `?filter=${orderFilter}`
            : ''

        const statusQuery =
          statusFilter !== 'all'
            ? `${query ? '&' : '?'}status=${statusFilter.toLowerCase()}`
            : ''

        const response =
          await fetch(
            `/api/orders${query}${statusQuery}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          )

        if (!response.ok) {
          throw new Error(
            'Unable to load orders'
          )
        }

        const data =
          await response.json()

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
      `${order.product_name} ${order.game_name}`
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
      case ORDER_STATUS.DELIVERED:
        return '60%'

      case ORDER_STATUS.PENDING:
        return '20%'

      default:
        return '0%'
    }
  }

  return (
    <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      {/* ====================================== */}
      {/* HEADER */}
      {/* ====================================== */}

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Orders
          </h1>

          <p className="mt-2 text-slate-600">
            Track and manage
            your orders
          </p>
        </div>

        {/* ====================================== */}
        {/* CUSTOMER ACTIONS */}
        {/* ====================================== */}

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

        {/* ====================================== */}
        {/* SELLER ACTIONS */}
        {/* ====================================== */}

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

        {/* ====================================== */}
        {/* ADMIN ACTIONS */}
        {/* ====================================== */}

        {user?.role ===
          'admin' && (
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/admin/users">
              <Button className="gap-2">
                <Users size={18} />

                User Management
              </Button>
            </Link>

            <Link href="/dashboard/admin/orders">
              <Button
                variant="outline"
                className="gap-2"
              >
                <ClipboardList size={18} />

                Order Management
              </Button>
            </Link>

            <Link href="/dashboard/admin/withdrawals">
              <Button
                variant="outline"
                className="gap-2"
              >
                <Wallet size={18} />

                Withdraw Requests
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* ====================================== */}
      {/* SEARCH */}
      {/* ====================================== */}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

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

      {/* ====================================== */}
      {/* FILTERS */}
      {/* ====================================== */}

      <div className="mb-6 overflow-x-auto border-b border-slate-200">
        <div className="flex min-w-max gap-2">
          {[
            {
              key: 'all',
              label: 'All',
            },

            {
              key: 'pending',
              label: 'Pending',
            },

            {
              key: 'in_progress',
              label: 'In Progress',
            },

            {
              key: 'completed',
              label: 'Completed',
            },
          ].map((status) => (
            <button
              key={status.key}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                statusFilter ===
                status.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent hover:border-blue-600 hover:text-blue-600'
              }`}
              onClick={() =>
                setStatusFilter(
                  status.key
                )
              }
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>

      {/* ====================================== */}
      {/* ERROR */}
      {/* ====================================== */}

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ====================================== */}
      {/* ORDERS */}
      {/* ====================================== */}

      <div className="space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(
              (index) => (
                <Card key={index}>
                  <CardContent className="space-y-4 p-6">
                    <Skeleton className="h-4 w-1/2" />

                    <Skeleton className="h-5 w-full" />

                    <Skeleton className="h-4 w-2/3" />
                  </CardContent>
                </Card>
              )
            )}
          </div>
        ) : filteredOrders.length >
          0 ? (
          filteredOrders.map(
            (order) => (
              <Card
                key={order.id}
                className="transition-shadow hover:shadow-md"
              >
                <CardContent className="p-4 sm:p-6">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                    {/* PRODUCT */}

                    <div className="md:col-span-4">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {
                          order.game_name
                        }
                      </p>

                      <Link
                        href={`/dashboard/orders/${order.id}`}
                      >
                        <h3 className="font-semibold text-slate-900 hover:text-blue-600">
                          {
                            order.product_name
                          }
                        </h3>
                      </Link>

                      <p className="mt-1 text-sm text-slate-600">
                        {order.assigned_seller_id
                          ? 'Seller assigned'
                          : 'Waiting for seller'}
                      </p>
                    </div>

                    {/* PRICE */}

                    <div className="md:col-span-2">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Price
                      </p>

                      <p className="text-lg font-bold text-slate-900">
                        {
                          order.points_amount
                        }{' '}
                        pts
                      </p>
                    </div>

                    {/* PROGRESS */}

                    <div className="md:col-span-2">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Progress
                      </p>

                      <div className="h-2 w-full rounded-full bg-slate-200">
                        <div
                          className="h-2 rounded-full bg-blue-600 transition-all"
                          style={{
                            width:
                              progressWidth(
                                order.status
                              ),
                          }}
                        />
                      </div>

                      <p className="mt-1 text-xs text-slate-600">
                        {getStatusLabel(
                          order.status
                        )}
                      </p>
                    </div>

                    {/* STATUS */}

                    <div className="md:col-span-2">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </p>

                      <span
                        className={`inline-block rounded border px-2 py-1 text-xs font-medium ${getStatusColor(order.status)}`}
                      >
                        {getStatusLabel(
                          order.status
                        )}
                      </span>
                    </div>

                    {/* ACTION */}

                    <div className="flex items-center md:col-span-2">
                      <Link
                        href={`/dashboard/orders/${order.id}`}
                        className="w-full"
                      >
                        <Button
                          variant="outline"
                          size="sm"
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
              <p className="mb-4 text-slate-600">
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
