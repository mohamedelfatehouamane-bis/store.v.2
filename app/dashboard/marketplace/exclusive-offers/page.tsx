'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import SellerBadge from '@/components/seller-badge'
import { Search, ShoppingCart, User, Filter, Plus } from 'lucide-react'

type ExclusiveOffer = {
  id: string
  name: string
  description: string
  price: number
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
  created_at: string
  status: 'pending' | 'approved' | 'rejected'
}

export default function ExclusiveOffersPage() {
  const router = useRouter()
  const { user, token } = useAuth()
  const [offers, setOffers] = useState<ExclusiveOffer[]>([])
  const [myPacks, setMyPacks] = useState<ExclusiveOffer[]>([])
  const [filteredOffers, setFilteredOffers] = useState<ExclusiveOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [myPacksLoading, setMyPacksLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSeller, setSelectedSeller] = useState<string | null>(null)

  useEffect(() => {
    async function loadOffers() {
      try {
        setLoading(true)
        setError('')
        const headers: Record<string, string> = {}
        if (token) {
          headers.Authorization = `Bearer ${token}`
        }

        const response = await fetch('/api/exclusive-offers', {
          headers,
        })
        if (!response.ok) {
          throw new Error('Failed to fetch exclusive offers')
        }
        const data = await response.json()
        setOffers(data.offers ?? [])
        setFilteredOffers(data.offers ?? [])
      } catch (err) {
        console.error('Error loading offers:', err)
        setError(err instanceof Error ? err.message : 'Failed to load offers')
      } finally {
        setLoading(false)
      }
    }

    loadOffers()
  }, [token])

  useEffect(() => {
    async function loadMyPacks() {
      if (!token || user?.role !== 'seller') return

      try {
        setMyPacksLoading(true)
        const response = await fetch('/api/exclusive-offers/my', {
          headers: { Authorization: `Bearer ${token}` },
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to fetch your packs')
        }

        setMyPacks(data.packs ?? [])
      } catch (err) {
        console.error('Error loading my packs:', err)
      } finally {
        setMyPacksLoading(false)
      }
    }

    loadMyPacks()
  }, [token, user?.role])

  useEffect(() => {
    const filtered = offers.filter((offer) => {
      const matchesSearch =
        offer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (offer.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        offer.seller.username.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesSeller = !selectedSeller || offer.seller.id === selectedSeller

      return matchesSearch && matchesSeller
    })
    setFilteredOffers(filtered)
  }, [searchQuery, selectedSeller, offers])

  // Get unique sellers for filter
  const sellers = Array.from(
    new Map(offers.map((offer) => [offer.seller.id, offer.seller])).values()
  )

  const handleViewDetails = (offerId: string) => {
    router.push(`/dashboard/marketplace/exclusive-offers/${offerId}`)
  }

  const handleOrderNow = (offerId: string) => {
    // Navigate to order creation page with exclusive offer ID
    router.push(`/dashboard/marketplace/orders/create?exclusiveOfferId=${offerId}`)
  }

  const statusBadgeClass: Record<string, string> = {
    approved: 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30',
    pending: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
    rejected: 'bg-red-600/20 text-red-400 border-red-600/30',
  }

  return (
    <div className="flex-1 p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 min-h-screen">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Exclusive Seller Packs</h1>
          <p className="text-slate-400">
            Discover premium bundles crafted by verified sellers with special pricing
          </p>
        </div>
        {user?.role === 'seller' && (
          <Button
            onClick={() => router.push('/dashboard/marketplace/exclusive-offers/create')}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Exclusive Pack
          </Button>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3 text-red-400">
          {error}
        </div>
      )}

      {/* Search and Filters */}
      <div className="mb-8 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 h-5 w-5" />
          <Input
            placeholder="Search packs by name, seller, or description..."
            className="pl-10 bg-slate-800 border-slate-700 text-white placeholder-slate-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Seller Filter */}
        {sellers.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap padding-4">
            <span className="text-sm text-slate-400 flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filter by Seller:
            </span>
            <button
              onClick={() => setSelectedSeller(null)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selectedSeller === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              All Sellers
            </button>
            {sellers.map((seller) => (
              <button
                key={seller.id}
                onClick={() => setSelectedSeller(seller.id)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  selectedSeller === seller.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {seller.username}
              </button>
            ))}
          </div>
        )}
      </div>

      {user?.role === 'seller' && (
        <Card className="mb-8 bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">My Packs</CardTitle>
            <CardDescription className="text-slate-400">
              Track statuses and resubmit rejected packs after editing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {myPacksLoading ? (
              <p className="text-slate-400">Loading your packs...</p>
            ) : myPacks.length === 0 ? (
              <p className="text-slate-400">You have not created any exclusive packs yet.</p>
            ) : (
              <div className="space-y-3">
                {myPacks.map((pack) => (
                  <div key={pack.id} className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-white font-semibold">{pack.name}</p>
                        <p className="text-slate-400 text-sm">{pack.price} points</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={statusBadgeClass[pack.status] ?? statusBadgeClass.pending}>
                          {pack.status}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push(`/dashboard/marketplace/exclusive-offers/${pack.id}`)}
                          className="border-slate-600 text-slate-200"
                        >
                          View
                        </Button>
                        {pack.status !== 'approved' && (
                          <Button
                            size="sm"
                            onClick={() => router.push(`/dashboard/marketplace/exclusive-offers/${pack.id}/edit`)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            {pack.status === 'rejected' ? 'Edit + Resubmit' : 'Edit'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Offers Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-400">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          Loading exclusive offers...
        </div>
      ) : filteredOffers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredOffers.map((offer) => (
            <Card
              key={offer.id}
              className="bg-gradient-to-br from-slate-800/50 to-slate-800/30 border-slate-700 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-300 flex flex-col group"
            >
              {/* Badge for Game if available */}
              <div className="px-6 pt-6 flex items-start justify-between">
                <div className="flex-1">
                  {offer.game && (
                    <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30 mb-3">
                      {offer.game.name}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30">
                    Exclusive
                  </Badge>
                  <Badge className={statusBadgeClass[offer.status] ?? statusBadgeClass.pending}>
                    {offer.status}
                  </Badge>
                </div>
              </div>

              <CardHeader className="pb-4">
                <CardTitle className="text-white text-xl mb-2 line-clamp-2">
                  {offer.name}
                </CardTitle>
                {offer.description && (
                  <CardDescription className="text-slate-400 line-clamp-3">
                    {offer.description}
                  </CardDescription>
                )}
              </CardHeader>

              {/* Seller Info */}
              <CardContent className="space-y-4 flex-1 flex flex-col">
                <div className="bg-slate-700/30 rounded-lg p-4 flex items-center gap-3">
                  {offer.seller.avatar_url ? (
                    <img
                      src={offer.seller.avatar_url}
                      alt={offer.seller.username}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-slate-600 flex items-center justify-center">
                      <User className="h-5 w-5 text-slate-400" />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-xs text-slate-400">Seller</p>
                    <p className="text-sm text-white font-semibold">{offer.seller.username}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <SellerBadge seller={offer.seller} />
                      <span className="text-xs text-slate-400">
                        Trust Score: {Number(offer.seller.trust_score ?? 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex-1"></div>

                {/* Price Section */}
                <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg p-4 border border-blue-900/50">
                  <p className="text-xs text-slate-400 mb-1">Pack Price</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-blue-400">{offer.price}</p>
                    <p className="text-sm text-slate-400">points</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={() => handleViewDetails(offer.id)}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700/50"
                  >
                    Details
                  </Button>
                  <Button
                    onClick={() => handleOrderNow(offer.id)}
                    disabled={offer.status !== 'approved'}
                    className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {offer.status === 'approved' ? 'Order Now' : 'Unavailable'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="py-12">
              <p className="text-slate-400 mb-4">
                {searchQuery || selectedSeller ? 'No packs found matching your criteria' : 'No exclusive offers available yet'}
              </p>
              {(searchQuery || selectedSeller) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('')
                    setSelectedSeller(null)
                  }}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  Clear Filters
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Info Section */}
      <Card className="mt-12 bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">About Exclusive Packs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-white font-semibold mb-2">✨ What Makes Them Special?</h3>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li>• Curated bundles with premium value</li>
                <li>• Competitive pricing from trusted sellers</li>
                <li>• Often better value than individual purchases</li>
                <li>• Direct contact with seller for customization</li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-2">🚀 How to Order?</h3>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li>1. Browse and find the perfect pack</li>
                <li>2. Check the seller and description</li>
                <li>3. Click "Order Now" to proceed</li>
                <li>4. Confirm your order with points</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
