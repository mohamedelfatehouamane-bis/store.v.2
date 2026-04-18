'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth-context'
import { useLanguage } from '@/lib/language-context'

interface DisputeItem {
  id: string
  order_id: string
  reason: string
  status: string
  previous_status?: string | null
  admin_note?: string | null
  created_at: string
  updated_at: string
  opened_by?: { username?: string | null }
}

export default function AdminDisputesPage() {
  const router = useRouter()
  const { user, token, isLoading } = useAuth()
  const { t } = useLanguage()
  const [disputes, setDisputes] = useState<DisputeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [noteMap, setNoteMap] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<Record<string, boolean>>({})

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

    const loadDisputes = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await fetch('/api/admin/disputes', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await response.json()
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Unable to load disputes')
        }

        setDisputes(data.disputes ?? [])
      } catch (err) {
        console.error(err)
        setError(err instanceof Error ? err.message : 'Failed to load disputes')
      } finally {
        setLoading(false)
      }
    }

    void loadDisputes()
  }, [isLoading, router, token, user])

  const handleStatusChange = async (disputeId: string, status: 'open' | 'reviewing' | 'resolved' | 'rejected') => {
    if (!token) return
    setPending((current) => ({ ...current, [disputeId]: true }))

    try {
      const response = await fetch(`/api/admin/disputes/${disputeId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status, admin_note: noteMap[disputeId]?.trim() ?? '' }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to update dispute')
      }

      setDisputes((current) =>
        current.map((item) => (item.id === disputeId ? { ...item, status, admin_note: noteMap[disputeId]?.trim() ?? item.admin_note } : item))
      )
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to update dispute')
    } finally {
      setPending((current) => ({ ...current, [disputeId]: false }))
    }
  }

  const disputesByStatus = useMemo(
    () => ({
      open: disputes.filter((item) => item.status === 'open'),
      reviewing: disputes.filter((item) => item.status === 'reviewing'),
      resolved: disputes.filter((item) => item.status === 'resolved'),
      rejected: disputes.filter((item) => item.status === 'rejected'),
    }),
    [disputes]
  )

  const statusOrder: Array<'open' | 'reviewing' | 'resolved' | 'rejected'> = ['open', 'reviewing', 'resolved', 'rejected']

  const getStatusTitle = (status: 'open' | 'reviewing' | 'resolved' | 'rejected') => {
    if (status === 'open') return t('open')
    if (status === 'reviewing') return t('reviewing')
    if (status === 'resolved') return t('resolved')
    return t('rejected')
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('disputeCases')}</h1>
          <p className="text-sm text-slate-600">{t('reviewResolveDisputes')}</p>
        </div>
        <Link href="/dashboard/admin" className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {t('backToAdminDashboard')}
        </Link>
      </div>

      {error ? (
        <Card>
          <CardContent className="rounded-lg border border-red-200 bg-red-50 text-red-700">{error}</CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" /> {t('loadingDisputes')}
        </div>
      ) : disputes.length === 0 ? (
        <Card>
          <CardContent className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-slate-600">{t('noDisputesReported')}</CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {statusOrder.map((status) => (
            <Card key={status}>
              <CardHeader>
                <CardTitle>{getStatusTitle(status)} {t('cases')}</CardTitle>
                <CardDescription>{disputesByStatus[status].length} {t('disputesInState')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {disputesByStatus[status].length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                    {t('noDisputesInState')}
                  </div>
                ) : (
                  disputesByStatus[status].map((dispute) => (
                    <div key={dispute.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <p className="text-sm text-slate-500">{t('orderWithNumber')}{dispute.order_id}</p>
                          <p className="text-sm font-semibold text-slate-900">{t('openedBy')} {dispute.opened_by?.username ?? t('unknownUser')}</p>
                          <p className="text-xs text-slate-500">{t('reportedOn')} {new Date(dispute.created_at).toLocaleString()}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/dashboard/orders/${dispute.order_id}`} className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100">
                            {t('openOrder')}
                          </Link>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700">
                        <p className="font-medium text-slate-900">{t('reason')}</p>
                        <p className="mt-2 whitespace-pre-wrap">{dispute.reason}</p>
                      </div>

                      <div className="mt-4 space-y-3">
                        <Textarea
                          value={noteMap[dispute.id] ?? dispute.admin_note ?? ''}
                          onChange={(event) => setNoteMap((current) => ({ ...current, [dispute.id]: event.target.value }))}
                          placeholder={t('addInternalNote')}
                          rows={3}
                        />

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => void handleStatusChange(dispute.id, 'reviewing')}
                            disabled={pending[dispute.id]}
                          >
                            {t('markReviewing')}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => void handleStatusChange(dispute.id, 'rejected')}
                            disabled={pending[dispute.id]}
                          >
                            {t('rejectDispute')}
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => void handleStatusChange(dispute.id, 'resolved')}
                            disabled={pending[dispute.id]}
                          >
                            {t('resolveWithRefund')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
