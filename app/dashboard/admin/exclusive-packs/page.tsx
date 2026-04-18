'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Check, X } from 'lucide-react'

type PendingPack = {
  id: string
  name: string
  description: string | null
  price: number
  created_at: string
  status: 'pending' | 'approved' | 'rejected'
  seller: {
    id: string
    username: string
  }
  game?: {
    id: string
    name: string
  } | null
}

export default function AdminExclusivePacksPage() {
  const { user } = useAuth()
  const [packs, setPacks] = useState<PendingPack[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)

  const isAdmin = user?.role === 'admin'

  function authHeaders(): Record<string, string> {
    const token = localStorage.getItem('auth_token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  async function loadPendingPacks() {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/exclusive-packs/pending', {
        headers: authHeaders(),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load pending packs')
      }
      setPacks(data.packs ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load pending packs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdmin) return
    loadPendingPacks()
  }, [isAdmin])

  async function handleDecision(packId: string, decision: 'approve' | 'reject') {
    setActionId(packId)
    try {
      const response = await fetch(`/api/admin/exclusive-packs/${packId}/${decision}`, {
        method: 'POST',
        headers: authHeaders(),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || `Failed to ${decision} pack`)
      }
      toast.success(decision === 'approve' ? 'Pack approved' : 'Pack rejected')
      setPacks((current) => current.filter((pack) => pack.id !== packId))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${decision} pack`)
    } finally {
      setActionId(null)
    }
  }

  if (!isAdmin) {
    return <div className="p-6 text-center text-gray-500">Access restricted to admins only.</div>
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-black dark:text-white">Review Exclusive Packs</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Review seller-created exclusive packs before they become available to customers.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending Packs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : packs.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No pending packs right now.</div>
          ) : (
            <div className="space-y-4">
              {packs.map((pack) => (
                <div
                  key={pack.id}
                  className="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-black dark:text-white">{pack.name}</h3>
                        <Badge variant="outline" className="capitalize">
                          {pack.status}
                        </Badge>
                        {pack.game?.name ? <Badge>{pack.game.name}</Badge> : null}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Seller: {pack.seller?.username || 'Unknown'}
                      </p>
                      {pack.description ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{pack.description}</p>
                      ) : null}
                      <p className="text-sm font-medium text-black dark:text-white">{pack.price} points</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleDecision(pack.id, 'approve')}
                        disabled={actionId === pack.id}
                      >
                        {actionId === pack.id ? (
                          <Loader2 size={14} className="mr-2 animate-spin" />
                        ) : (
                          <Check size={14} className="mr-2" />
                        )}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDecision(pack.id, 'reject')}
                        disabled={actionId === pack.id}
                      >
                        <X size={14} className="mr-2" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
