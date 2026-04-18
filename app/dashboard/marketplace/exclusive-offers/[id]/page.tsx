'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import SellerBadge from '@/components/seller-badge'
import { ArrowLeft, ShoppingCart, User, Loader2, AlertCircle } from 'lucide-react'

type ExclusiveOffer = {
  id: string
  name: string
  description: string
  price: number
  created_at: string
  seller: {
    id: string
    username: string
    avatar_url?: string
    rating?: number
    total_reviews?: number
    completed_orders?: number
    dispute_count?: number
    trust_score?: number
    trust_badge?: 'top' | 'trusted' | 'warning'
    is_risky?: boolean
  }
  game?: {
    id: string
    name: string
  }
  status: 'pending' | 'approved' | 'rejected'
}

export default function ExclusiveOfferDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const { token } = useAuth()
  const offerId = params.id as string

  const [offer, setOffer] = useState<ExclusiveOffer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const statusBadgeClass: Record<string, string> = {
    approved: 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30',
    pending: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
    rejected: 'bg-red-600/20 text-red-400 border-red-600/30',
  }

  useEffect(() => {
    async function loadOffer() {
      try {
        setLoading(true)
        setError('')
        const headers: Record<string, string> = {}
        if (token) {
          headers.Authorization = `Bearer ${token}`
        }

        const response = await fetch(`/api/exclusive-offers/${offerId}`, {
          headers,
        })
        if (!response.ok) {
          throw new Error('Failed to fetch offer')
        }
        const data = await response.json()
        setOffer(data)
      } catch (err) {
        console.error('Error loading offer:', err)
        setError(err instanceof Error ? err.message : 'Failed to load offer')
      } finally {
        setLoading(false)
      }
    }

    if (offerId) {
      loadOffer()
    }
  }, [offerId, token])

  const handleOrderNow = () => {
    if (offer) {
      router.push(`/dashboard/marketplace/orders/create?exclusiveOfferId=${offer.id}`)
    }
  }

  const handleGoBack = () => {
    router.push('/dashboard/marketplace/exclusive-offers')
  }

  const createdDate = offer ? new Date(offer.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) : ''

  if (loading) {
    return (
      <div className="flex-1 p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading offer details...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 min-h-screen">
        <Button
          variant="ghost"
          onClick={handleGoBack}
          className="text-slate-400 hover:text-white hover:bg-slate-800 mb-6"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back
        </Button>

        <div className="rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3 text-red-400 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!offer) {
    return (
      <div className="flex-1 p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 min-h-screen">
        <Button
          variant="ghost"
          onClick={handleGoBack}
          className="text-slate-400 hover:text-white hover:bg-slate-800 mb-6"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back
        </Button>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-12 text-center">
            <p className="text-slate-400">Offer not found</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex-1 p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={handleGoBack}
          className="text-slate-400 hover:text-white hover:bg-slate-800 mb-6"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Exclusive Offers
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Offer Header */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {offer.game && (
                      <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30">
                        {offer.game.name}
                      </Badge>
                    )}
                    <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30">
                      Exclusive
                    </Badge>
                    <Badge className={`capitalize ${statusBadgeClass[offer.status] ?? statusBadgeClass.pending}`}>
                      {offer.status}
                    </Badge>
                  </div>
                  <CardTitle className="text-3xl text-white">{offer.name}</CardTitle>
                </div>
              </div>
              <p className="text-sm text-slate-500">Listed on {createdDate}</p>
            </CardHeader>
          </Card>

          {/* Description */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Package Details</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-300 text-lg leading-relaxed">{offer.description}</p>
            </CardContent>
          </Card>

          {/* Seller Information */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">About the Seller</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 p-4 bg-slate-700/30 rounded-lg">
                {offer.seller.avatar_url ? (
                  <img
                    src={offer.seller.avatar_url}
                    alt={offer.seller.username}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-slate-600 flex items-center justify-center">
                    <User className="h-8 w-8 text-slate-400" />
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-white font-semibold text-lg">{offer.seller.username}</p>
                  <p className="text-slate-400 text-sm">Verified Seller</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <SellerBadge seller={offer.seller} />
                    <span className="text-xs text-slate-400">
                      Trust Score: {Number(offer.seller.trust_score ?? 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-4 bg-blue-900/20 border border-blue-900/30 rounded-lg">
                <p className="text-blue-400 text-sm">
                  ✓ This seller creates quality packs with great value for money
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Benefits Section */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Why Choose This Pack?</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-green-400 font-bold mt-0.5">✓</span>
                  <div>
                    <p className="text-white font-semibold">Curated Bundle</p>
                    <p className="text-slate-400 text-sm">Hand-picked items specifically bundled together</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-green-400 font-bold mt-0.5">✓</span>
                  <div>
                    <p className="text-white font-semibold">Better Value</p>
                    <p className="text-slate-400 text-sm">Save points compared to buying items separately</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-green-400 font-bold mt-0.5">✓</span>
                  <div>
                    <p className="text-white font-semibold">Verified Seller</p>
                    <p className="text-slate-400 text-sm">Trusted seller with proven track record</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-green-400 font-bold mt-0.5">✓</span>
                  <div>
                    <p className="text-white font-semibold">Quick Delivery</p>
                    <p className="text-slate-400 text-sm">Fast completion of your order</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <Card className="sticky top-8 bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Order Summary</CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Price */}
              <div>
                <p className="text-xs text-slate-400 mb-2">Pack Price</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-4xl font-bold text-blue-400">{offer.price}</p>
                  <p className="text-slate-400">points</p>
                </div>
              </div>

              {/* Game Tag */}
              {offer.game && (
                <div className="bg-slate-700/30 rounded-lg p-4">
                  <p className="text-xs text-slate-400 mb-2">For Game</p>
                  <p className="text-white font-semibold">{offer.game.name}</p>
                </div>
              )}

              {/* Seller Info */}
              <div className="bg-slate-700/30 rounded-lg p-4">
                <p className="text-xs text-slate-400 mb-2">Seller</p>
                <p className="text-white font-semibold">{offer.seller.username}</p>
              </div>

              {/* Action Button */}
              <Button
                onClick={handleOrderNow}
                disabled={offer.status !== 'approved'}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-base font-semibold"
              >
                <ShoppingCart className="h-5 w-5 mr-2" />
                {offer.status === 'approved' ? 'Order Now' : 'Unavailable'}
              </Button>

              <p className="text-xs text-slate-500 text-center">
                You&apos;ll be able to select your game account during checkout
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
