'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Loader2, AlertCircle, Check } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useLanguage } from '@/lib/language-context'
import { toast } from 'sonner'

type GameAccount = {
  id: string
  game_id: string
  game_name: string
  account_identifier: string
  account_email?: string
}

type Offer = {
  id: string
  name: string
  quantity: number
  unit: string
  points_price: number
  description?: string
}

type ExclusiveOffer = {
  id: string
  name: string
  description: string
  price: number
  seller: {
    id: string
    username: string
  }
  game?: {
    id: string
    name: string
  }
}

export default function CreateOrderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, token } = useAuth()
  const { t } = useLanguage()

  // Query parameters
  const offerId = searchParams.get('offerId')
  const gameId = searchParams.get('gameId')
  const exclusiveOfferId = searchParams.get('exclusiveOfferId')
  const quantityParam = Number(searchParams.get('quantity') || '1')
  const orderQuantity = Number.isFinite(quantityParam)
    ? Math.max(1, Math.min(99, Math.floor(quantityParam)))
    : 1

  // UI State
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState('')

  // Data State
  const [offer, setOffer] = useState<Offer | null>(null)
  const [exclusiveOffer, setExclusiveOffer] = useState<ExclusiveOffer | null>(null)
  const [gameAccounts, setGameAccounts] = useState<GameAccount[]>([])
  const [userBalance, setUserBalance] = useState(0)
  const [isOrderType, setIsOrderType] = useState<'offer' | 'exclusive'>('offer')

  // Validate inputs
  useEffect(() => {
    if (!user) {
      router.push('/auth/login')
      return
    }

    if (!offerId && !exclusiveOfferId) {
      router.push('/dashboard/marketplace/games')
      return
    }

    if (!offerId && !gameId && !exclusiveOfferId) {
      setError('Invalid request parameters')
      return
    }
  }, [user, offerId, gameId, exclusiveOfferId, router])

  // Load offer details and game accounts
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError('')

      try {
        if (!token) {
          throw new Error('Authentication required')
        }

        // Load offer details
        if (offerId && gameId) {
          setIsOrderType('offer')
          const response = await fetch(`/api/games/${gameId}/offers`)
          if (!response.ok) throw new Error('Failed to load offer')

          const data = await response.json()
          const foundOffer = data.offers?.find((o: Offer) => o.id === offerId)
          if (!foundOffer) throw new Error('Offer not found')
          setOffer(foundOffer)
        } else if (exclusiveOfferId) {
          setIsOrderType('exclusive')
          const response = await fetch(`/api/exclusive-offers/${exclusiveOfferId}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!response.ok) throw new Error('Failed to load exclusive offer')

          const data = await response.json()
          setExclusiveOffer(data)

          // If exclusive offer has a game, use that
          if (data.game?.id) {
            // Load game accounts for this game
          }
        }

        // Load user's game accounts
        const accountsResponse = await fetch('/api/game-accounts', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!accountsResponse.ok) throw new Error('Failed to load game accounts')

        const accountsData = await accountsResponse.json()
        setGameAccounts(accountsData.accounts || [])

        // Load user balance
        const profileResponse = await fetch('/api/users/profile', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          setUserBalance(profileData.user?.points ?? profileData.user?.balance ?? 0)
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : t('failedToLoadOrderDetails')
        setError(errorMsg)
        console.error('Load order data error:', err)
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      loadData()
    }
  }, [token, offerId, gameId, exclusiveOfferId])

  const handleCreateOrder = async () => {
    if (!selectedAccountId) {
      toast.error(t('selectGameAccount'))
      return
    }

    if (isOrderType === 'offer' && !offer) {
      toast.error(t('offerDetailsNotLoaded'))
      return
    }

    if (isOrderType === 'exclusive' && !exclusiveOffer) {
      toast.error(t('exclusiveOfferDetailsNotLoaded'))
      return
    }

    const requiredPoints = isOrderType === 'offer' ? offer!.points_price : exclusiveOffer!.price
    const finalRequiredPoints = requiredPoints * orderQuantity

    if (userBalance < finalRequiredPoints) {
      toast.error(t('insufficientPointsForOrder'))
      return
    }

    setSubmitting(true)
    try {
      if (!token) throw new Error('Authentication required')

      let orderPayload: any = {
        account_id: selectedAccountId,
      }

      if (isOrderType === 'offer') {
        // Standard offer order — no seller pre-selection needed; the API assigns one.
        const selectedAccount = gameAccounts.find((a) => a.id === selectedAccountId)
        if (!selectedAccount) throw new Error('Invalid game account selected')

        orderPayload = {
          ...orderPayload,
          game_id: gameId,
          offer_id: offerId,
          quantity: orderQuantity,
        }

        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(orderPayload),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to create order')
        }

        const orderData = await response.json()
        toast.success(t('orderCreatedSuccessfully'))
        router.push(`/dashboard/orders/${orderData.order_id ?? orderData.id}`)
        return
      } else if (isOrderType === 'exclusive') {
        const currentExclusiveOffer = exclusiveOffer
        if (!currentExclusiveOffer) {
          throw new Error('Exclusive offer details not loaded')
        }

        // Exclusive offer order
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            game_id: currentExclusiveOffer.game?.id || 'default-game',
            exclusive_offer_id: exclusiveOfferId,
            account_id: selectedAccountId,
            quantity: orderQuantity,
            seller_id: currentExclusiveOffer.seller.id,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to create order')
        }

        const orderData = await response.json()
        toast.success(t('orderCreatedSuccessfully'))
        router.push(`/dashboard/orders/${orderData.id}`)
        return
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : t('errorOccurred')
      toast.error(errorMsg)
      console.error('Create order error:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoBack = () => {
    if (isOrderType === 'offer' && gameId) {
      router.push(`/dashboard/marketplace/offers/game/${gameId}`)
    } else if (isOrderType === 'exclusive') {
      router.push('/dashboard/marketplace/exclusive-offers')
    } else {
      router.push('/dashboard/marketplace/games')
    }
  }

  const accountsForGame = isOrderType === 'offer' && gameId ? gameAccounts.filter((a) => a.game_id === gameId) : gameAccounts

  const basePoints = isOrderType === 'offer' ? offer?.points_price ?? 0 : exclusiveOffer?.price ?? 0
  const requiredPoints = basePoints * orderQuantity
  const hasEnoughPoints = userBalance >= requiredPoints
  const offerName = isOrderType === 'offer' ? offer?.name : exclusiveOffer?.name
  const gameName = isOrderType === 'offer' ? 'Game Service' : exclusiveOffer?.game?.name
  const sellerName = isOrderType === 'exclusive' ? exclusiveOffer?.seller?.username : undefined

  if (loading) {
    return (
      <div className="flex-1 p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading order details...</p>
        </div>
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
          Back
        </Button>

        <h1 className="text-4xl font-bold text-white mb-2">Confirm Your Order</h1>
        <p className="text-slate-400">Review details and select your game account</p>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3 text-red-400 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Offer Details */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-400 mb-1">Offer Name</p>
                  <p className="text-white font-semibold text-lg">{offerName || 'Loading...'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Game</p>
                  <p className="text-white font-semibold text-lg">{gameName || 'Loading...'}</p>
                </div>
              </div>

              <div className="bg-slate-700/30 rounded-lg p-4">
                <p className="text-xs text-slate-400 mb-1">Order Quantity</p>
                <p className="text-white font-semibold">x{orderQuantity}</p>
              </div>

              {sellerName && (
                <div className="bg-slate-700/30 rounded-lg p-4">
                  <p className="text-xs text-slate-400 mb-1">Seller</p>
                  <p className="text-white font-semibold">{sellerName}</p>
                  <Badge className="mt-2 bg-blue-600/20 text-blue-400 border-blue-600/30">Seller Pack</Badge>
                </div>
              )}

              {offer && (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Quantity</p>
                    <p className="text-white font-semibold">
                      {offer.quantity} {offer.unit}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Cost</p>
                    <p className="text-blue-400 font-semibold text-lg">{offer.points_price} points each</p>
                  </div>
                </div>
              )}

              {exclusiveOffer && (
                <div className="pt-4 border-t border-slate-700">
                  <p className="text-xs text-slate-400 mb-2">Description</p>
                  <p className="text-slate-300 text-sm">{exclusiveOffer.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Game Account Selection */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Select Game Account</CardTitle>
              <CardDescription>Choose which game account to use for this order</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {accountsForGame.length > 0 ? (
                accountsForGame.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => setSelectedAccountId(account.id)}
                    className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                      selectedAccountId === account.id
                        ? 'border-blue-500/50 bg-blue-950/20'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-white mb-1">{account.account_identifier}</p>
                        <p className="text-xs text-slate-400">
                          {account.game_name} • {account.account_email || 'No email'}
                        </p>
                      </div>
                      {selectedAccountId === account.id && (
                        <div className="bg-blue-600 rounded-full p-2">
                          <Check className="h-4 w-4 text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-6 bg-slate-700/30 rounded-lg text-center">
                  <p className="text-slate-400 mb-4">
                    No game accounts found for{' '}
                    {isOrderType === 'offer' ? 'this game' : 'the selected game'}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => router.push('/dashboard/profile')}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700/50"
                  >
                    Add Game Account
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Order Summary Sidebar */}
        <div className="lg:col-span-1">
          <Card className="sticky top-8 bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Order Summary</CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Points */}
              <div>
                <p className="text-xs text-slate-400 mb-1">Order Cost</p>
                <p className="text-3xl font-bold text-blue-400">{requiredPoints}</p>
                <p className="text-xs text-slate-500">points</p>
              </div>

              {/* Balance Check */}
              <div className="bg-slate-700/50 rounded-lg p-4">
                <p className="text-xs text-slate-400 mb-2">Your Balance</p>
                <p className={`text-2xl font-bold ${hasEnoughPoints ? 'text-green-400' : 'text-red-400'}`}>
                  {userBalance} points
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  {hasEnoughPoints ? (
                    <span className="text-green-400">✓ You have enough points</span>
                  ) : (
                    <span className="text-red-400">✗ Insufficient points</span>
                  )}
                </p>
              </div>

              {/* Remaining Points */}
              {hasEnoughPoints && (
                <div className="border-t border-slate-700 pt-4">
                  <p className="text-xs text-slate-400 mb-1">Points After Order</p>
                  <p className="text-lg font-semibold text-slate-300">{userBalance - requiredPoints} points</p>
                </div>
              )}

              {/* Create Order Button */}
              <Button
                onClick={handleCreateOrder}
                disabled={!selectedAccountId || !hasEnoughPoints || submitting}
                className={`w-full h-11 font-semibold ${
                  hasEnoughPoints
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Order...
                  </>
                ) : (
                  'Create Order'
                )}
              </Button>

              {!selectedAccountId && (
                <p className="text-xs text-slate-500 text-center">Select a game account to proceed</p>
              )}

              {!hasEnoughPoints && (
                <div className="bg-red-950/30 border border-red-900/30 rounded-lg p-3">
                  <p className="text-xs text-red-400">
                    You need {requiredPoints - userBalance} more points to complete this order
                  </p>
                </div>
              )}

              <p className="text-xs text-slate-500 text-center pt-4 border-t border-slate-700">
                Once created, a seller will review and accept your order
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
