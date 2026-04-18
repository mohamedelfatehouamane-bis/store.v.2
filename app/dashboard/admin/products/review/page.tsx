'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useLanguage } from '@/lib/language-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type Product = {
  id: string
  name: string
  game_name: string
  category_name: string
  seller_name: string
  points_price: number
  status: string
  created_at: string
}

export default function AdminProductsReviewPage() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const isAdmin = user?.role === 'admin'

  function authHeaders(): Record<string, string> {
    const token = localStorage.getItem('auth_token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  async function loadPendingProducts() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/products', { headers: authHeaders() })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Unable to load products')
      }

      setProducts((data.products ?? []).filter((product: any) => product.status === 'pending'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load products')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdmin) return
    loadPendingProducts()
  }, [isAdmin])

  async function handleAction(id: string, action: 'approve' | 'reject') {
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/products/${id}/${action}`, {
        method: 'POST',
        headers: authHeaders(),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Unable to ${action} product`)
      }
      toast.success(`Product ${action}d successfully`)
      await loadPendingProducts()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Unable to ${action} product`)
    } finally {
      setBusyId(null)
    }
  }

  const totalPending = useMemo(() => products.length, [products])

  if (!user) {
    return <div className="p-6 text-center text-gray-500">{t('loadingUser')}</div>
  }

  if (!isAdmin) {
    return <div className="p-6 text-center text-gray-500">{t('onlyAdminsCanAccessThisPage')}</div>
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white">{t('pendingProductReviews')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('approveOrRejectSellerSubmissions')}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200">
          {t('pendingItems')}: <span className="font-semibold">{totalPending}</span>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : products.length === 0 ? (
            <div className="py-16 text-center text-gray-400">{t('noPendingProductsToReview')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left dark:border-gray-800 dark:bg-gray-900">
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Product</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('game')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('category')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Seller</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('price')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {products.map((product) => (
                    <tr key={product.id} className="bg-white transition-colors hover:bg-gray-50 dark:bg-gray-950 dark:hover:bg-gray-900">
                      <td className="px-4 py-3 font-medium text-black dark:text-white">{product.name}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{product.game_name}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{product.category_name}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{product.seller_name}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{product.points_price.toLocaleString()} pts</td>
                      <td className="px-4 py-3 flex gap-2">
                        <Button
                          onClick={() => handleAction(product.id, 'approve')}
                          disabled={busyId === product.id}
                          size="sm"
                        >
                          {t('approve')}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => handleAction(product.id, 'reject')}
                          disabled={busyId === product.id}
                          size="sm"
                        >
                          {t('reject')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
