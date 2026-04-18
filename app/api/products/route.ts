import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { ensureBucket, sanitizeStorageFileName } from '@/lib/storage'
import { z } from 'zod'
import { calculateTrustScore } from '@/lib/trust-score'

const createProductSchema = z.object({
  game_id: z.string().uuid(),
  category_id: z.string().uuid(),
  name: z.string().min(1),
  points_price: z.coerce.number().int().positive(),
  description: z.string().optional(),
  image_url: z.string().url().optional(),
})

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024

function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { status: 401 as const, error: 'Unauthorized: missing token' }
  }

  const auth = verifyToken(authHeader.substring(7))
  if (!auth) {
    return { status: 401 as const, error: 'Unauthorized: invalid token' }
  }

  return { status: 200 as const, auth }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sellerId = searchParams.get('sellerId')
    const gameId = searchParams.get('gameId')
    const categoryId = searchParams.get('categoryId')
    const status = searchParams.get('status') ?? 'approved'
    const page = Number(searchParams.get('page') || 1)
    const limit = Number(searchParams.get('limit') || 10)
    const safePage = Number.isInteger(page) && page > 0 ? page : 1
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 10
    const from = (safePage - 1) * safeLimit
    const to = from + safeLimit - 1

    let query = supabase
      .from('products')
      .select(
        `id, name, description, is_active, created_at, image_url, points_price, type, status, category_id, game_id, seller_id`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to)

    if (status !== 'all') {
      query = query.eq('status', status)
    }

    if (sellerId) {
      query = query.eq('seller_id', sellerId)
    }

    if (gameId) {
      query = query.eq('game_id', gameId)
    }

    if (categoryId) {
      query = query.eq('category_id', categoryId)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Get products error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const productsRaw = data ?? []
    const gameIds = Array.from(
      new Set(
        productsRaw
          .map((product: any) => product.game_id)
          .filter((id: string | null | undefined) => Boolean(id))
      )
    )
    const sellerIds = Array.from(
      new Set(
        productsRaw
          .map((product: any) => product.seller_id)
          .filter((id: string | null | undefined) => Boolean(id))
      )
    )
    const categoryIds = Array.from(
      new Set(
        productsRaw
          .map((product: any) => product.category_id)
          .filter((id: string | null | undefined) => Boolean(id))
      )
    )

    let gameMap: Record<string, { id: string; name: string }> = {}
    if (gameIds.length > 0) {
      const { data: games, error: gameError } = await supabase
        .from('games')
        .select('id, name')
        .in('id', gameIds)

      if (gameError) {
        console.error('Get product games error:', gameError)
      } else {
        gameMap = Object.fromEntries(
          (games ?? []).map((game: any) => [game.id, { id: game.id, name: game.name }])
        )
      }
    }

    let sellerMap: Record<string, { id: string; username: string; trust_score: number; rating: number; completed_orders: number; dispute_count: number }> = {}
    if (sellerIds.length > 0) {
      let sellers: any[] = []

      const { data: sellersWithReputation, error: sellersWithReputationError } = await supabase
        .from('users')
        .select('id, username, rating, completed_orders, dispute_count')
        .in('id', sellerIds)

      if (sellersWithReputationError && sellersWithReputationError.code === '42703') {
        const { data: sellersLegacy, error: sellersLegacyError } = await supabase
          .from('users')
          .select('id, username')
          .in('id', sellerIds)

        if (sellersLegacyError) {
          console.error('Get product sellers fallback error:', sellersLegacyError)
        } else {
          sellers = sellersLegacy ?? []
        }
      } else if (sellersWithReputationError) {
        console.error('Get product sellers error:', sellersWithReputationError)
      } else {
        sellers = sellersWithReputation ?? []
      }

      if (sellers.length > 0) {
        sellerMap = Object.fromEntries(
          sellers.map((seller: any) => {
            const rating = Number(seller.rating ?? 0)
            const completedOrders = Number(seller.completed_orders ?? 0)
            const disputeCount = Number(seller.dispute_count ?? 0)

            return [
              seller.id,
              {
                id: seller.id,
                username: seller.username,
                rating,
                completed_orders: completedOrders,
                dispute_count: disputeCount,
                trust_score: calculateTrustScore({
                  rating,
                  completed_orders: completedOrders,
                  dispute_count: disputeCount,
                }),
              },
            ]
          })
        )
      }
    }

    let categoryMap: Record<string, { id: string; name: string }> = {}
    if (categoryIds.length > 0) {
      const { data: categories, error: categoryError } = await supabase
        .from('categories')
        .select('id, name')
        .in('id', categoryIds)

      if (categoryError) {
        console.error('Get product categories error:', categoryError)
      } else {
        categoryMap = Object.fromEntries(
          (categories ?? []).map((category: any) => [category.id, { id: category.id, name: category.name }])
        )
      }
    }

    const products = productsRaw.map((product: any) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      image_url: product.image_url,
      points_price: product.points_price,
      type: product.type,
      status: product.status,
      is_active: product.is_active,
      created_at: product.created_at,
      game: product.game_id ? gameMap[product.game_id] ?? null : null,
      category: product.category_id
        ? categoryMap[product.category_id] ?? { id: product.category_id, name: '' }
        : null,
      seller: product.seller_id ? sellerMap[product.seller_id] ?? null : null,
    }))

    return NextResponse.json({
      success: true,
      products,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: count ?? products.length,
      },
    })
  } catch (error) {
    console.error('Get products error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = getAuth(request)
    if (authResult.status !== 200) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const auth = authResult.auth
    const contentType = request.headers.get('content-type') || ''
    const isMultipart = contentType.includes('multipart/form-data')

    let payload: z.infer<typeof createProductSchema>
    let imageFile: File | null = null

    if (isMultipart) {
      const formData = await request.formData()
      imageFile = formData.get('image_file') instanceof File ? (formData.get('image_file') as File) : null
      payload = createProductSchema.parse({
        game_id: String(formData.get('game_id') || '').trim(),
        category_id: String(formData.get('category_id') || '').trim(),
        name: String(formData.get('name') || '').trim(),
        points_price: formData.get('points_price'),
        description: String(formData.get('description') || '').trim() || undefined,
      })
    } else {
      const body = await request.json()
      payload = createProductSchema.parse(body)
    }

    const { data: categoryExists, error: categoryError } = await supabase
      .from('categories')
      .select('id')
      .eq('id', payload.category_id)
      .eq('game_id', payload.game_id)
      .maybeSingle()

    if (categoryError) {
      return NextResponse.json({ error: categoryError.message }, { status: 500 })
    }

    if (!categoryExists) {
      return NextResponse.json({ error: 'Validation error', details: [{ field: 'category_id', message: 'Category does not belong to the selected game' }] }, { status: 400 })
    }

    let imageUrl = payload.image_url || ''
    if (isMultipart) {
      if (!imageFile) {
        return NextResponse.json(
          { error: 'Validation error', details: [{ field: 'image_file', message: 'Image file is required' }] },
          { status: 400 }
        )
      }

      if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
        return NextResponse.json(
          { error: 'Validation error', details: [{ field: 'image_file', message: 'Only JPG, PNG, WEBP, or GIF images are allowed' }] },
          { status: 400 }
        )
      }

      if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
        return NextResponse.json(
          { error: 'Validation error', details: [{ field: 'image_file', message: 'Image size must be 25MB or less' }] },
          { status: 400 }
        )
      }

      if (!supabaseAdmin) {
        return NextResponse.json(
          { error: 'Server misconfiguration', message: 'Image upload service is not configured' },
          { status: 500 }
        )
      }

      try {
        await ensureBucket(supabaseAdmin, 'products', '25MB')
      } catch (bucketError) {
        return NextResponse.json(
          { error: bucketError instanceof Error ? bucketError.message : 'Unable to prepare product storage bucket' },
          { status: 500 }
        )
      }

      const originalName = sanitizeStorageFileName(imageFile.name)
      const storagePath = `products/${Date.now()}-${originalName}`
      const bytes = await imageFile.arrayBuffer()
      const fileBytes = Buffer.from(bytes)

      const uploadResult = await supabaseAdmin.storage.from('products').upload(storagePath, fileBytes, {
        contentType: imageFile.type,
        upsert: false,
      })

      if (uploadResult.error) {
        return NextResponse.json(
          { error: uploadResult.error.message || 'Unable to upload product image' },
          { status: 500 }
        )
      }

      const { data: publicUrlData } = supabaseAdmin.storage.from('products').getPublicUrl(storagePath)
      imageUrl = publicUrlData.publicUrl
    }

    const productPayload: any = {
      game_id: payload.game_id,
      category_id: payload.category_id,
      name: payload.name,
      description: payload.description || null,
      image_url: imageUrl,
      points_price: payload.points_price,
    }

    if (auth.role === 'seller') {
      productPayload.seller_id = auth.id
      productPayload.type = 'exclusive'
      productPayload.status = 'pending'
    } else if (auth.role === 'admin') {
      productPayload.seller_id = null
      productPayload.type = 'admin'
      productPayload.status = 'approved'
    } else {
      return NextResponse.json({ error: 'Only admin and seller roles can create products' }, { status: 403 })
    }

    const { data: productInsert, error: insertError } = await supabase
      .from('products')
      .insert(productPayload)
      .select('id, game_id, category_id, seller_id, type, status, name, description, image_url, points_price, created_at')
      .single()

    if (insertError || !productInsert) {
      console.error('Create product error:', insertError)
      return NextResponse.json({ error: insertError?.message || 'Failed to create product' }, { status: 500 })
    }

    return NextResponse.json({ success: true, product: productInsert }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.errors.map((item) => ({ field: item.path.join('.') || 'body', message: item.message }))
      return NextResponse.json({ error: 'Validation error', details }, { status: 400 })
    }

    console.error('Create product error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
