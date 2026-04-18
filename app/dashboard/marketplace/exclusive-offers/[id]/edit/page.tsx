'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type Game = {
  id: string
  name: string
}

type ExclusiveOffer = {
  id: string
  name: string
  description: string
  price: number
  status: 'pending' | 'approved' | 'rejected'
  game?: {
    id: string
    name: string
  }
}

export default function EditExclusivePackPage() {
  const params = useParams()
  const router = useRouter()
  const { user, token } = useAuth()
  const offerId = params.id as string

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [gameId, setGameId] = useState('')
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user && user.role !== 'seller') {
      router.push('/dashboard/marketplace/exclusive-offers')
      return
    }

    async function loadData() {
      if (!token || !offerId) return

      try {
        setLoading(true)
        const headers = { Authorization: `Bearer ${token}` }

        const [offerRes, gamesRes] = await Promise.all([
          fetch(`/api/exclusive-offers/${offerId}`, { headers }),
          fetch('/api/games'),
        ])

        const offerData = await offerRes.json()
        if (!offerRes.ok) {
          throw new Error(offerData?.error || 'Failed to load pack')
        }

        const offer = offerData as ExclusiveOffer
        setName(offer.name || '')
        setDescription(offer.description || '')
        setPrice(String(offer.price ?? ''))
        setGameId(offer.game?.id || '')

        const gamesData = await gamesRes.json()
        if (gamesRes.ok) {
          setGames(gamesData.games ?? [])
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load pack')
        router.push('/dashboard/marketplace/exclusive-offers')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user, token, offerId, router])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    if (!token) {
      toast.error('Authentication required')
      return
    }

    const numericPrice = Number(price)
    if (!name.trim() || !Number.isFinite(numericPrice) || numericPrice <= 0) {
      toast.error('Please enter a valid name and price')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(`/api/exclusive-offers/${offerId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          price: numericPrice,
          game_id: gameId || null,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update pack')
      }

      toast.success('Pack updated and submitted for review')
      router.push('/dashboard/marketplace/exclusive-offers')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update pack')
    } finally {
      setSubmitting(false)
    }
  }

  if (user && user.role !== 'seller') {
    return null
  }

  if (loading) {
    return (
      <div className="flex-1 p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="flex-1 p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 min-h-screen">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.push('/dashboard/marketplace/exclusive-offers')}
          className="text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Exclusive Packs
        </Button>
      </div>

      <Card className="mx-auto max-w-2xl bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-2xl">Edit Exclusive Pack</CardTitle>
          <p className="text-slate-400 text-sm">
            Updating this pack sends it for admin review again.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-slate-200">Pack Name</Label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="bg-slate-900/60 border-slate-700 text-white"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Description</Label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="bg-slate-900/60 border-slate-700 text-white min-h-28"
              />
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-slate-200">Price (Points)</Label>
                <Input
                  type="number"
                  min={1}
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  className="bg-slate-900/60 border-slate-700 text-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Game (Optional)</Label>
                <select
                  value={gameId}
                  onChange={(event) => setGameId(event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-white"
                >
                  <option value="">All games</option>
                  {games.map((game) => (
                    <option key={game.id} value={game.id}>
                      {game.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save and Resubmit'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
