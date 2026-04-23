'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

type Game = {
  id: string
  name: string
}

type Category = {
  id: string
  name: string
  game_id?: string
}

type Product = {
  id: string
  name: string
  image_url?: string | null
  game: { id: string; name: string } | null
  category: { id: string; name: string } | null
  points_price: number
  status: string
  is_active: boolean
  created_at: string
}

const emptyForm = {
  game_id: '',
  category_id: '',
  name: '',
  points_price: '',
}

const MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export default function SellerProductsPage() {
  const { user } = useAuth()
  const [games, setGames] = useState<Game[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [form, setForm] = useState(emptyForm)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const isSeller = user?.role === 'seller'

  function authHeaders(): Record<string, string> {
    const token = localStorage.getItem('auth_token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  async function loadAllowedGames() {
    try {
      const [sellerCategoriesRes, gamesRes] = await Promise.all([
        fetch('/api/sellers/categories', { headers: authHeaders() }),
        fetch('/api/games'),
      ])

      const sellerCategoriesData = await sellerCategoriesRes.json()
      const gamesData = await gamesRes.json()

      if (!sellerCategoriesRes.ok) {
        throw new Error(sellerCategoriesData.error || 'Unable to load seller categories')
      }

      if (!gamesRes.ok) {
        throw new Error(gamesData.error || 'Unable to load games')
      }

      const allowedGameIds = new Set(
        (sellerCategoriesData.categories ?? []).map((category: any) => String(category.game_id))
      )

      const allowedGames = (gamesData.games ?? []).filter((game: any) =>
        allowedGameIds.has(String(game.id))
      )

      setGames(allowedGames)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load allowed games')
    }
  }

  async function loadCategories(gameId: string) {
    if (!gameId) {
      setCategories([])
      setForm((state) => ({ ...state, category_id: '' }))
      return
    }

    try {
      const res = await fetch(`/api/sellers/categories?game_id=${gameId}`, {
        headers: authHeaders(),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Unable to load categories')
      }

      setCategories(data.categories ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load categories')
    }
  }

  async function loadProducts() {
    if (!user?.id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/products?sellerId=${user.id}&status=${statusFilter}`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Unable to load products')
      }
      setProducts(data.products ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load products')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isSeller) return
    loadAllowedGames()
    loadProducts()
  }, [isSeller])

  useEffect(() => {
    if (!form.game_id) {
      setCategories([])
      setForm((state) => ({ ...state, category_id: '' }))
      return
    }

    loadCategories(form.game_id)
  }, [form.game_id])

  useEffect(() => {
    if (!isSeller) return
    loadProducts()
  }, [statusFilter, user?.id])

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()

    if (!form.game_id || !form.category_id || !form.name || !form.points_price || !imageFile) {
      toast.error('Game, category, product name, price, and image are required')
      return
    }

    if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
      toast.error('Only JPG, PNG, WEBP, or GIF images are allowed')
      return
    }

    if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
      toast.error('Image size must be 25MB or less')
      return
    }

    const payload = new FormData()
    payload.append('game_id', form.game_id)
    payload.append('category_id', form.category_id)
    payload.append('name', form.name.trim())
    payload.append('points_price', String(Number(form.points_price)))
    payload.append('image_file', imageFile)

    setCreating(true)
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: authHeaders(),
        body: payload,
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Unable to create product')
      }

      toast.success('Product submitted for review')
      setForm(emptyForm)
        setImageFile(null)
        setImagePreview('')
      setCategories([])
      await loadProducts()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create product')
    } finally {
      setCreating(false)
    }
  }

  useEffect(() => {
    if (!imageFile) {
      setImagePreview('')
      return
    }

    const preview = URL.createObjectURL(imageFile)
    setImagePreview(preview)

    return () => URL.revokeObjectURL(preview)
  }, [imageFile])

  const totalProducts = useMemo(() => products.length, [products])

  if (!user) {
    return <div className="p-6 text-center text-gray-500">Loading user...</div>
  }

  if (!isSeller) {
    return <div className="p-6 text-center text-gray-500">Only sellers can access this page.</div>
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white">Seller Products</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Create and manage your exclusive products.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200">
            Total products: <span className="font-semibold">{totalProducts}</span>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200">
            Filter: 
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="ml-2 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create Exclusive Product</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Game</label>
              <select
                value={form.game_id}
                onChange={(e) => setForm((state) => ({ ...state, game_id: e.target.value }))}
                className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                required
                disabled={games.length === 0}
              >
                <option value="">{games.length === 0 ? 'No allowed games' : 'Select a game...'}</option>
                {games.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Category</label>
              <select
                value={form.category_id}
                onChange={(e) => setForm((state) => ({ ...state, category_id: e.target.value }))}
                className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                required
                disabled={!form.game_id || categories.length === 0}
              >
                <option value="">{form.game_id && categories.length === 0 ? 'No allowed categories' : 'Select a category...'}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Product Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((state) => ({ ...state, name: e.target.value }))}
                placeholder="e.g. Legendary Game Pack"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Price (points)</label>
              <Input
                type="number"
                min={1}
                value={form.points_price}
                onChange={(e) => setForm((state) => ({ ...state, points_price: e.target.value }))}
                placeholder="e.g. 1200"
                required
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-4 flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Product Image</label>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                required
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">Upload a JPG, PNG, WEBP, or GIF image up to 25MB.</p>
              {imagePreview ? (
                <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                  <img src={imagePreview} alt="Product preview" className="h-48 w-full object-cover" />
                </div>
              ) : null}
            </div>

            <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-2">
              <Button type="submit" disabled={creating} size="sm">
                {creating ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Plus size={14} className="mr-2" />}
                Submit Product
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My Products</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : products.length === 0 ? (
            <div className="py-16 text-center text-gray-400">No products created yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left dark:border-gray-800 dark:bg-gray-900">
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Image</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Game</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Category</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Product</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Price</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {products.map((product) => (
                    <tr key={product.id} className="bg-white transition-colors hover:bg-gray-50 dark:bg-gray-950 dark:hover:bg-gray-900">
                      <td className="px-4 py-3">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="h-12 w-12 rounded-md border border-gray-200 object-cover dark:border-gray-800"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-gray-300 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
                            No img
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{product.game?.name ?? '-'}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{product.category?.name ?? '-'}</td>
                      <td className="px-4 py-3 font-medium text-black dark:text-white">{product.name}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{product.points_price.toLocaleString()} pts</td>
                      <td className="px-4 py-3">
                        <Badge variant={product.status === 'approved' ? 'default' : product.status === 'pending' ? 'secondary' : 'outline'}>
                          {product.status}
                        </Badge>
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
