'use client'

import { useEffect, useState } from 'react'
import {
  useRouter,
  useSearchParams,
} from 'next/navigation'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { Button } from '@/components/ui/button'

import { Badge } from '@/components/ui/badge'

import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Check,
} from 'lucide-react'

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

type Product = {
  id: string
  name: string
  quantity: number
  unit: string
  points_price: number
  description?: string
}

export default function CreateOrderPage() {
  const router = useRouter()

  const searchParams =
    useSearchParams()

  const { user, token } =
    useAuth()

  const { t } =
    useLanguage()

  // IMPORTANT:
  // offerId in URL is actually product ID now
  const productId =
    searchParams.get('offerId')

  const gameId =
    searchParams.get('gameId')

  const quantityParam = Number(
    searchParams.get('quantity') ||
      '1'
  )

  const orderQuantity =
    Number.isFinite(quantityParam)
      ? Math.max(
          1,
          Math.min(
            99,
            Math.floor(quantityParam)
          )
        )
      : 1

  const [loading, setLoading] =
    useState(true)

  const [
    submitting,
    setSubmitting,
  ] = useState(false)

  const [error, setError] =
    useState('')

  const [
    selectedAccountId,
    setSelectedAccountId,
  ] = useState('')

  const [product, setProduct] =
    useState<Product | null>(null)

  const [
    gameAccounts,
    setGameAccounts,
  ] = useState<GameAccount[]>(
    []
  )

  const [
    userBalance,
    setUserBalance,
  ] = useState(0)

  // ==================================================
  // VALIDATE
  // ==================================================

  useEffect(() => {
    if (!user) {
      router.push('/auth/login')
      return
    }

    if (!productId || !gameId) {
      router.push(
        '/dashboard/marketplace/games'
      )
      return
    }
  }, [
    user,
    productId,
    gameId,
    router,
  ])

  // ==================================================
  // LOAD DATA
  // ==================================================

  useEffect(() => {
    async function loadData() {
      setLoading(true)

      setError('')

      try {
        if (!token) {
          throw new Error(
            'Authentication required'
          )
        }

        // LOAD PRODUCTS

        const response =
          await fetch(
            `/api/games/${gameId}/offers`
          )

        if (!response.ok) {
          throw new Error(
            'Failed to load products'
          )
        }

        const data =
          await response.json()

        const foundProduct =
          data.offers?.find(
            (p: Product) =>
              p.id === productId
          )

        if (!foundProduct) {
          throw new Error(
            'Product not found'
          )
        }

        setProduct(foundProduct)

        // LOAD ACCOUNTS

        const accountsResponse =
          await fetch(
            '/api/game-accounts',
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          )

        if (
          !accountsResponse.ok
        ) {
          throw new Error(
            'Failed to load game accounts'
          )
        }

        const accountsData =
          await accountsResponse.json()

        setGameAccounts(
          accountsData.accounts || []
        )

        // LOAD USER BALANCE

        const profileResponse =
          await fetch(
            '/api/users/profile',
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          )

        if (
          profileResponse.ok
        ) {
          const profileData =
            await profileResponse.json()

          setUserBalance(
            profileData.user
              ?.points ??
              0
          )
        }
      } catch (err) {
        console.error(
          'Load order error:',
          err
        )

        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load'
        )
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      loadData()
    }
  }, [token, gameId, productId])

  // ==================================================
  // CREATE ORDER
  // ==================================================

  const handleCreateOrder =
    async () => {
      if (!selectedAccountId) {
        toast.error(
          'Select game account'
        )

        return
      }

      if (!product) {
        toast.error(
          'Product not loaded'
        )

        return
      }

      const requiredPoints =
        product.points_price *
        orderQuantity

      if (
        userBalance <
        requiredPoints
      ) {
        toast.error(
          'Insufficient points'
        )

        return
      }

      setSubmitting(true)

      try {
        if (!token) {
          throw new Error(
            'Authentication required'
          )
        }

        // IMPORTANT:
        // BACKEND EXPECTS product_id

        const payload = {
          game_id: gameId,
          product_id: product.id,
          account_id:
            selectedAccountId,
        }

        console.log(
          'ORDER PAYLOAD:',
          payload
        )

        const response =
          await fetch(
            '/api/orders',
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',

                Authorization: `Bearer ${token}`,
              },

              body: JSON.stringify(
                payload
              ),
            }
          )

        const data =
          await response.json()

        console.log(
          'ORDER RESPONSE:',
          data
        )

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Failed to create order'
          )
        }

        toast.success(
          'Order created successfully'
        )

        router.push(
          `/dashboard/orders/${
            data.order?.id ||
            data.id
          }`
        )
      } catch (err) {
        console.error(
          'Create order error:',
          err
        )

        toast.error(
          err instanceof Error
            ? err.message
            : 'Error creating order'
        )
      } finally {
        setSubmitting(false)
      }
    }

  // ==================================================
  // HELPERS
  // ==================================================

  const handleGoBack = () => {
    router.push(
      `/dashboard/marketplace/offers/game/${gameId}`
    )
  }

  const accountsForGame =
    gameAccounts.filter(
      (a) =>
        a.game_id === gameId
    )

  const requiredPoints =
    (product?.points_price || 0) *
    orderQuantity

  const hasEnoughPoints =
    userBalance >= requiredPoints

  // ==================================================
  // LOADING
  // ==================================================

  if (loading) {
    return (
      <div className="flex-1 p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />

          <p className="text-slate-400">
            Loading...
          </p>
        </div>
      </div>
    )
  }

  // ==================================================
  // UI
  // ==================================================

  return (
    <div className="flex-1 p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 min-h-screen">
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={
            handleGoBack
          }
          className="text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />

          Back
        </Button>

        <h1 className="text-4xl font-bold text-white mt-4">
          Confirm Order
        </h1>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3 text-red-400 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />

          <div>
            <p className="font-semibold">
              Error
            </p>

            <p className="text-sm">
              {error}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">
                Product Details
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-slate-400">
                  Product
                </p>

                <p className="text-white font-semibold text-lg">
                  {product?.name}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-400">
                  Price
                </p>

                <p className="text-blue-400 font-bold text-2xl">
                  {
                    product?.points_price
                  }{' '}
                  pts
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">
                Select Account
              </CardTitle>

              <CardDescription>
                Choose game account
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
              {accountsForGame.map(
                (account) => (
                  <button
                    key={
                      account.id
                    }
                    onClick={() =>
                      setSelectedAccountId(
                        account.id
                      )
                    }
                    className={`w-full p-4 rounded-lg border-2 text-left ${
                      selectedAccountId ===
                      account.id
                        ? 'border-blue-500 bg-blue-950/20'
                        : 'border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-white font-semibold">
                          {
                            account.account_identifier
                          }
                        </p>

                        <p className="text-xs text-slate-400">
                          {
                            account.game_name
                          }
                        </p>
                      </div>

                      {selectedAccountId ===
                        account.id && (
                        <div className="bg-blue-600 rounded-full p-2">
                          <Check className="h-4 w-4 text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                )
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="bg-slate-800/50 border-slate-700 sticky top-8">
            <CardHeader>
              <CardTitle className="text-white">
                Order Summary
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
              <div>
                <p className="text-xs text-slate-400">
                  Order Cost
                </p>

                <p className="text-3xl font-bold text-blue-400">
                  {
                    requiredPoints
                  }
                </p>

                <p className="text-xs text-slate-500">
                  points
                </p>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-4">
                <p className="text-xs text-slate-400">
                  Your Balance
                </p>

                <p
                  className={`text-2xl font-bold ${
                    hasEnoughPoints
                      ? 'text-green-400'
                      : 'text-red-400'
                  }`}
                >
                  {userBalance}{' '}
                  points
                </p>
              </div>

              <Button
                onClick={
                  handleCreateOrder
                }
                disabled={
                  !selectedAccountId ||
                  !hasEnoughPoints ||
                  submitting
                }
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />

                    Creating...
                  </>
                ) : (
                  'Create Order'
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
