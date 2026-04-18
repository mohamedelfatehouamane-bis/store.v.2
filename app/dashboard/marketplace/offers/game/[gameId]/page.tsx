'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Check } from 'lucide-react'

type Offer = {
  id: string
  name: string
  description: string
  quantity: number
  unit: string
  points_price: number
  image_url?: string
}

type GameInfo = {
  id: string
  name: string
}

export default function GameOffersPage() {
  const params = useParams()
  const router = useRouter()
  const gameId = params.gameId as string

  const [game, setGame] = useState<GameInfo | null>(null)
  const [offers, setOffers] = useState<Offer[]>([])
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null)
  const [orderQuantity, setOrderQuantity] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const clampQuantity = (value: number) => {
    if (!Number.isFinite(value)) return 1
    return Math.max(1, Math.min(99, Math.floor(value)))
  }

  useEffect(() => {
    async function loadOffers() {
      try {
        setLoading(true)
        setError('')
        const response = await fetch(`/api/games/${gameId}/offers`)
        if (!response.ok) {
          throw new Error('Failed to fetch offers')
        }
        const data = await response.json()
        setGame(data.game)
        setOffers(data.offers ?? [])
      } catch (err) {
        console.error('Error loading offers:', err)
        setError(err instanceof Error ? err.message : 'Failed to load offers')
      } finally {
        setLoading(false)
      }
    }

    if (gameId) {
      loadOffers()
    }
  }, [gameId])

  const handleCreateOrder = () => {
    if (selectedOfferId) {
      // Navigate to order creation page with selected offer
      router.push(`/dashboard/marketplace/orders/create?offerId=${selectedOfferId}&gameId=${gameId}&quantity=${orderQuantity}`)
    }
  }

  const handleGoBack = () => {
    router.push('/dashboard/marketplace/games')
  }

  const selectedOffer = offers.find((o) => o.id === selectedOfferId)
  const finalPointsPrice = selectedOffer ? selectedOffer.points_price * orderQuantity : 0

  return (
    <div className="flex-1 p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 min-h-screen">
      {/* Header with Back Button */}
      <div className="mb-8 flex items-center gap-4">
        <Button
          variant="ghost"
          size="lg"
          onClick={handleGoBack}
          className="text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Games
        </Button>
      </div>

      {/* Game Title */}
      {game && (
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">{game.name} Services</h1>
          <p className="text-slate-400">Select an offer to proceed with your order</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3 text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Offers List */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="py-12 text-center text-slate-400">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
              Loading offers...
            </div>
          ) : offers.length > 0 ? (
            <div className="space-y-4">
              {offers.map((offer) => (
                <Card
                  key={offer.id}
                  onClick={() => setSelectedOfferId(offer.id)}
                  className={`cursor-pointer transition-all duration-200 ${
                    selectedOfferId === offer.id
                      ? 'border-blue-500/50 bg-blue-950/20 shadow-lg shadow-blue-500/20'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
                          {offer.image_url ? (
                            <img
                              src={offer.image_url}
                              alt={offer.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                              No image
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-white text-lg mb-2">{offer.name}</CardTitle>
                          <CardDescription className="text-slate-400">{offer.description}</CardDescription>
                        </div>
                      </div>
                      {selectedOfferId === offer.id && (
                        <div className="bg-blue-600 rounded-full p-2">
                          <Check className="h-5 w-5 text-white" />
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="bg-slate-700/50 rounded-lg p-4">
                        <p className="text-xs text-slate-400 mb-1">Quantity</p>
                        <p className="text-lg font-semibold text-white">
                          {offer.quantity} {offer.unit}
                        </p>
                      </div>
                      <div className="bg-blue-900/30 rounded-lg p-4 md:col-span-2">
                        <p className="text-xs text-slate-400 mb-1">Points Price</p>
                        <p className="text-3xl font-bold text-blue-400">{offer.points_price}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="py-12 text-center">
                <p className="text-slate-400">No offers available for this game</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <Card className="sticky top-8 bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Order Summary</CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
              {selectedOffer ? (
                <>
                  <div>
                    <p className="text-sm text-slate-400 mb-2">Selected Offer</p>
                    <p className="text-white font-semibold">{selectedOffer.name}</p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-400 mb-2">Package Quantity</p>
                    <p className="text-white font-semibold">
                      {selectedOffer.quantity} {selectedOffer.unit}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-400 mb-2">Order Quantity</p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-slate-600 text-slate-300 hover:bg-slate-700 h-9 w-9 p-0"
                        onClick={() => setOrderQuantity((prev) => Math.max(1, prev - 1))}
                      >
                        -
                      </Button>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={orderQuantity}
                        onChange={(e) => setOrderQuantity(clampQuantity(Number(e.target.value || 1)))}
                        className="w-20 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-center text-white"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="border-slate-600 text-slate-300 hover:bg-slate-700 h-9 w-9 p-0"
                        onClick={() => setOrderQuantity((prev) => Math.min(99, prev + 1))}
                      >
                        +
                      </Button>
                    </div>
                  </div>

                  <div className="border-t border-slate-700 pt-4">
                    <p className="text-sm text-slate-400 mb-2">Unit Price</p>
                    <p className="text-xl font-bold text-slate-300">{selectedOffer.points_price}</p>
                    <p className="text-xs text-slate-500 mt-1">points per order</p>
                  </div>

                  <div className="border-t border-slate-700 pt-4">
                    <p className="text-sm text-slate-400 mb-2">Final Total</p>
                    <p className="text-3xl font-bold text-blue-400">{finalPointsPrice}</p>
                    <p className="text-xs text-slate-500 mt-1">points</p>
                  </div>

                  <Button
                    onClick={handleCreateOrder}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-base font-semibold"
                  >
                    Proceed to Order
                  </Button>

                  <p className="text-xs text-slate-500 text-center">
                    You will be able to select your game account and confirm payment in the next step
                  </p>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-slate-400">Select an offer to begin</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Features Section */}
      <Card className="mt-12 bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Why Order From Us?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="bg-blue-600/20 rounded-lg p-4 mb-3">
                <p className="text-blue-400 font-semibold">✓ Verified Sellers</p>
              </div>
              <p className="text-slate-400">All sellers are verified professionals</p>
            </div>
            <div>
              <div className="bg-green-600/20 rounded-lg p-4 mb-3">
                <p className="text-green-400 font-semibold">✓ Points Payment</p>
              </div>
              <p className="text-slate-400">Pay with your platform points</p>
            </div>
            <div>
              <div className="bg-purple-600/20 rounded-lg p-4 mb-3">
                <p className="text-purple-400 font-semibold">✓ Real-time Tracking</p>
              </div>
              <p className="text-slate-400">Monitor progress every step of the way</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
