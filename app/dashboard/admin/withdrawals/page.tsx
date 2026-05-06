'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'

type WithdrawalRow = {
  id: string
  seller_id: string
  seller_username: string | null
  seller_email: string | null
  amount_requested: number
  fee_percentage: number
  final_amount: number
  payment_name: string | null
  status: 'pending' | 'approved' | 'rejected' | string
  created_at: string
}

function statusBadge(status: string) {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-700'
  if (status === 'rejected') return 'bg-rose-100 text-rose-700'
  return 'bg-yellow-100 text-yellow-700'
}

export default function AdminWithdrawalsPage() {
  const router = useRouter()
  const { user, isLoading } = useAuth()
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')

  useEffect(() => {
    if (isLoading || !user) return
    if (user.role !== 'admin') {
      router.push('/dashboard')
      return
    }
    loadWithdrawals()
  }, [isLoading, user, statusFilter])

  const loadWithdrawals = async () => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      setError('Authentication required')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const url = statusFilter === 'all'
        ? '/api/admin/withdrawals'
        : `/api/admin/withdrawals?status=${statusFilter}`

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to load withdrawals')
      }
      setWithdrawals(data.withdrawals ?? [])
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to load withdrawals')
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (id: string, status: 'approved' | 'rejected') => {
    const token = localStorage.getItem('auth_token')
    if (!token) return

    setPending((prev) => ({ ...prev, [id]: true }))
    try {
      const response = await fetch(`/api/admin/withdrawals/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || `Unable to ${status} withdrawal`)
      }
      toast.success(data.message || `Withdrawal ${status}`)
      setWithdrawals((prev) =>
        prev.map((w) => (w.id === id ? { ...w, status } : w))
      )
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : `Failed to ${status} withdrawal`)
    } finally {
      setPending((prev) => ({ ...prev, [id]: false }))
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!user || user.role !== 'admin') return null

  return (
    <div className="flex-1 p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Withdrawal Requests</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Review and process seller withdrawal requests.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === f
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : withdrawals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500 dark:text-slate-400">
            No withdrawal requests found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {withdrawals.map((w) => (
            <Card key={w.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
                <div>
                  <CardTitle className="text-base">
                    {w.seller_username ?? w.seller_email ?? w.seller_id}
                  </CardTitle>
                  <CardDescription>
                    Request ID: {w.id}
                  </CardDescription>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusBadge(w.status)}`}
                >
                  {w.status}
                </span>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-slate-400">
                  <span>
                    <span className="font-medium text-slate-900 dark:text-white">Requested:</span>{' '}
                    {w.amount_requested.toLocaleString()} pts
                  </span>
                  <span>
                    <span className="font-medium text-slate-900 dark:text-white">Fee:</span>{' '}
                    {w.fee_percentage}%
                  </span>
                  <span>
                    <span className="font-medium text-slate-900 dark:text-white">Final:</span>{' '}
                    {w.final_amount.toLocaleString()} pts
                  </span>
                  {w.payment_name && (
                    <span>
                      <span className="font-medium text-slate-900 dark:text-white">Payment:</span>{' '}
                      {w.payment_name}
                    </span>
                  )}
                  <span>
                    <span className="font-medium text-slate-900 dark:text-white">Date:</span>{' '}
                    {new Date(w.created_at).toLocaleString()}
                  </span>
                </div>

                {w.status === 'pending' && (
                  <div className="mt-4 flex gap-3">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={!!pending[w.id]}
                      onClick={() => updateStatus(w.id, 'approved')}
                    >
                      {pending[w.id] ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!!pending[w.id]}
                      onClick={() => updateStatus(w.id, 'rejected')}
                    >
                      {pending[w.id] ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <XCircle className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
