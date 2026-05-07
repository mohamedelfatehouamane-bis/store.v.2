'use client'

import { useEffect, useMemo, useState } from 'react'

import {
  useRouter,
  useSearchParams,
} from 'next/navigation'

import Link from 'next/link'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { Button } from '@/components/ui/button'

import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Check,
} from 'lucide-react'

import { useAuth } from '@/lib/auth-context'

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
  quantity?: number
  unit?: string
  points_price: number
  description?: string
}

export default function CreateOrderPage() {
  const router = useRouter()

  const searchParams =
    useSearchParams()

  const { user, token } =
    useAuth()

  // IMPORTANT:
  // offerId is now product ID
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

  // ======================================================
  // VALIDATE ACCESS
  // ======================================================

  useEffect(() => {
    if (!user) {
      router.push('/auth/login')
      return
    }

    if (
      !productId ||
      !gameId
    ) {
      router.push(
        '/dashboard/marketplace'
      )
    }
  }, [
    user,
    productId,
    gameId,
    router,
  ])

  // ======================================================
  // LOAD DATA
  // ======================================================

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)

        setError('')

        if (!token) {
          throw new Error(
            'Authentication required'
          )
        }

        // ==========================================
        // LOAD PRODUCTS
        // ==========================================

        const productResponse =
          await fetch(
            `/api/games/${gameId}/offers`
          )

        if (
          !productResponse.ok
        ) {
          throw new Error(
            'Failed to load products'
          )
        }

        const productData =
          await productResponse.json()

        const foundProduct =
          productData.offers?.find(
            (p: Product) =>
              p.id === productId
          )

        if (!foundProduct) {
          throw new Error(
            'Product not found'
          )
        }

        setProduct(foundProduct)

        // ==========================================
        // LOAD GAME ACCOUNTS
        // ==========================================

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
            'Failed to load accounts'
          )
        }

        const accountsData =
          await accountsResponse.json()

        setGameAccounts(
          accountsData.accounts ||
            []
        )

        // ==========================================
        // LOAD USER BALANCE
        // ==========================================

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
            Number(
              profileData.user
                ?.points ?? 0
            )
          )
        }
      } catch (err) {
        console.error(
          'Load create order error:',
          err
        )

        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load data'
        )
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      loadData()
    }
  }, [
    token,
    productId,
    gameId,
  ])

  // ======================================================
  // FILTER ACCOUNTS
  // ======================================================

  const accountsForGame =
    useMemo(() => {
      return gameAccounts.filter(
        (account) =>
          String(
            account.game_id
          ) === String(gameId)
      )
    }, [gameAccounts, gameId])

  // ======================================================
  // ORDER VALUES
  // ======================================================

  const requiredPoints =
    (product?.points_price || 0) *
    orderQuantity

  const hasEnoughPoints =
    userBalance >= requiredPoints

  // ======================================================
  // CREATE ORDER
  // ======================================================

  const handleCreateOrder =
    async () => {
      try {
        if (!token) {
          throw new Error(
            'Authentication required'
          )
        }

        if (!product) {
          throw new Error(
            'Product not found'
          )
        }

        if (!selectedAccountId) {
          toast.error(
            'Please select a game account'
          )

          return
        }

        if (
          !hasEnoughPoints
        ) {
          toast.error(
            'Insufficient points'
          )

          return
        }

        setSubmitting(true)

        const payload = {
          game_id: gameId,
          product_id: product.id,
          account_id:
            selectedAccountId,
        }

        console.log(
          'CREATE ORDER PAYLOAD:',
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
            : 'Failed to create order'
        )
      } finally {
        setSubmitting(false)
      }
    }

  // ======================================================
  // LOADING
  // ======================================================

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-blue-500" />

          <p className="text-slate-400">
            Loading...
          </p>
        </div>
      </div>
    )
  }

  // ======================================================
  // ERROR
  // ======================================================

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
        <Card className="w-full max-w-lg border-red-900/40 bg-red-950/20">
          <CardContent className="py-10 text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />

            <h2 className="mb-2 text-xl font-bold text-white">
              Error
            </h2>

            <p className="mb-6 text-red-300">
              {error}
            </p>

            <Button
              onClick={() =>
                router.push(
                  '/dashboard/marketplace'
                )
              }
            >
              Return To Marketplace
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 p-8">
      <div className="mx-auto max-w-7xl">
        {/* HEADER */}

        <div className="mb-8">
          <Link
            href={`/dashboard/marketplace/offers/game/${gameId}`}
          >
            <Button
              variant="ghost"
              className="mb-4 text-slate-400 hover:text-white"
            >
              <ArrowLeft className="mr-2 h-5 w-5" />

              Back
            </Button>
          </Link>

          <h1 className="text-4xl font-bold text-white">
            Confirm Order
          </h1>
        </div>

        {/* CONTENT */}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* LEFT */}

          <div className="space-y-6 lg:col-span-2">
            {/* PRODUCT */}

            <Card className="border-slate-700 bg-slate-800/50">
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

                  <p className="text-lg font-semibold text-white">
                    {product?.name}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Price
                  </p>

                  <p className="text-2xl font-bold text-blue-400">
                    {
                      product?.points_price
                    }{' '}
                    pts
                  </p>
                </div>

                {product?.description && (
                  <div>
                    <p className="text-xs text-slate-400">
                      Description
                    </p>

                    <p className="text-sm text-slate-300">
                      {
                        product.description
                      }
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ACCOUNTS */}

            <Card className="border-slate-700 bg-slate-800/50">
              <CardHeader>
                <CardTitle className="text-white">
                  Select Account
                </CardTitle>

                <CardDescription>
                  Choose your game
                  account
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                {accountsForGame.length ===
                0 ? (
                  <div className="rounded-lg border border-yellow-900/40 bg-yellow-950/20 p-4 text-yellow-300">
                    No accounts found for
                    this game.
                  </div>
                ) : (
                  accountsForGame.map(
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
                        className={`w-full rounded-lg border-2 p-4 text-left transition ${
                          selectedAccountId ===
                          account.id
                            ? 'border-blue-500 bg-blue-950/20'
                            : 'border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-white">
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
                            <div className="rounded-full bg-blue-600 p-2">
                              <Check className="h-4 w-4 text-white" />
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  )
                )}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT */}

          <div>
            <Card className="sticky top-8 border-slate-700 bg-slate-800/50">
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
                    {requiredPoints}
                  </p>

                  <p className="text-xs text-slate-500">
                    points
                  </p>
                </div>

                <div className="rounded-lg bg-slate-700/50 p-4">
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
                    {userBalance} points
                  </p>
                </div>

                <Button
                  onClick={
                    handleCreateOrder
                  }
                  disabled={
                    submitting ||
                    !selectedAccountId ||
                    !hasEnoughPoints
                  }
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />

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
    </div>
  )
}
