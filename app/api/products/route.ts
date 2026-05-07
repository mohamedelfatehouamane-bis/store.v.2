import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseServer as supabase,
  supabaseAdmin,
} from '@/lib/db'

import { verifyToken } from '@/lib/auth'

import {
  ensureBucket,
  sanitizeStorageFileName,
} from '@/lib/storage'

import { z } from 'zod'

const createProductSchema = z.object({
  game_id: z.string().uuid(),

  category_id: z.string().uuid(),

  name: z.string().min(1),

  points_price: z.coerce
    .number()
    .int()
    .positive(),

  description: z.string().optional(),

  image_url: z.string().url().optional(),
})

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const MAX_IMAGE_SIZE_BYTES =
  25 * 1024 * 1024

function getAuth(request: NextRequest) {
  const authHeader =
    request.headers.get('authorization')

  if (
    !authHeader?.startsWith('Bearer ')
  ) {
    return {
      status: 401 as const,
      error:
        'Unauthorized: missing token',
    }
  }

  const auth = verifyToken(
    authHeader.substring(7)
  )

  if (!auth) {
    return {
      status: 401 as const,
      error:
        'Unauthorized: invalid token',
    }
  }

  return {
    status: 200 as const,
    auth,
  }
}

export async function GET(
  request: NextRequest
) {
  try {
    const { searchParams } =
      new URL(request.url)

    const gameId =
      searchParams.get('gameId')

    const categoryId =
      searchParams.get('categoryId')

    const status =
      searchParams.get('status') ??
      'approved'

    const page = Number(
      searchParams.get('page') || 1
    )

    const limit = Number(
      searchParams.get('limit') || 10
    )

    const safePage =
      Number.isInteger(page) && page > 0
        ? page
        : 1

    const safeLimit =
      Number.isInteger(limit) &&
      limit > 0
        ? Math.min(limit, 100)
        : 10

    const from =
      (safePage - 1) * safeLimit

    const to =
      from + safeLimit - 1

    // =====================================================
    // PRODUCTS QUERY
    // =====================================================

    let query = supabase
      .from('products')
      .select(
        `
          id,
          name,
          description,
          image_url,
          points_price,
          is_active,
          created_at,
          category_id,
          game_id,
          status
        `,
        {
          count: 'exact',
        }
      )
      .order('created_at', {
        ascending: false,
      })
      .range(from, to)

    if (status !== 'all') {
      query = query.eq(
        'status',
        status
      )
    }

    if (gameId) {
      query = query.eq(
        'game_id',
        gameId
      )
    }

    if (categoryId) {
      query = query.eq(
        'category_id',
        categoryId
      )
    }

    const {
      data,
      error,
      count,
    } = await query

    if (error) {
      console.error(
        'Get products error:',
        error
      )

      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 500 }
      )
    }

    const productsRaw = data ?? []

    // =====================================================
    // LOAD GAMES
    // =====================================================

    const gameIds = Array.from(
      new Set(
        productsRaw
          .map(
            (product: any) =>
              product.game_id
          )
          .filter(Boolean)
      )
    )

    let gameMap: Record<
      string,
      any
    > = {}

    if (gameIds.length > 0) {
      const {
        data: games,
      } = await supabase
        .from('games')
        .select('id, name')
        .in('id', gameIds)

      gameMap = Object.fromEntries(
        (games ?? []).map(
          (game: any) => [
            game.id,
            game,
          ]
        )
      )
    }

    // =====================================================
    // LOAD CATEGORIES
    // =====================================================

    const categoryIds = Array.from(
      new Set(
        productsRaw
          .map(
            (product: any) =>
              product.category_id
          )
          .filter(Boolean)
      )
    )

    let categoryMap: Record<
      string,
      any
    > = {}

    if (categoryIds.length > 0) {
      const {
        data: categories,
      } = await supabase
        .from('categories')
        .select('id, name')
        .in(
          'id',
          categoryIds
        )

      categoryMap =
        Object.fromEntries(
          (categories ?? []).map(
            (category: any) => [
              category.id,
              category,
            ]
          )
        )
    }

    // =====================================================
    // NORMALIZE PRODUCTS
    // =====================================================

    const products =
      productsRaw.map(
        (product: any) => ({
          id: product.id,

          name:
            product.name,

          description:
            product.description,

          image_url:
            product.image_url,

          points_price:
            Number(
              product.points_price ??
                0
            ),

          is_active:
            product.is_active,

          status:
            product.status,

          created_at:
            product.created_at,

          game:
            product.game_id
              ? gameMap[
                  product.game_id
                ] ?? null
              : null,

          category:
            product.category_id
              ? categoryMap[
                  product.category_id
                ] ?? null
              : null,
        })
      )

    return NextResponse.json({
      success: true,

      products,

      pagination: {
        page: safePage,

        limit: safeLimit,

        total:
          count ??
          products.length,
      },
    })
  } catch (error) {
    console.error(
      'Get products error:',
      error
    )

    return NextResponse.json(
      {
        error:
          'Internal server error',
      },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest
) {
  try {
    const authResult =
      getAuth(request)

    if (
      authResult.status !== 200
    ) {
      return NextResponse.json(
        {
          error:
            authResult.error,
        },
        {
          status:
            authResult.status,
        }
      )
    }

    const auth =
      authResult.auth

    const contentType =
      request.headers.get(
        'content-type'
      ) || ''

    const isMultipart =
      contentType.includes(
        'multipart/form-data'
      )

    let payload: z.infer<
      typeof createProductSchema
    >

    let imageFile: File | null =
      null

    // =====================================================
    // PARSE BODY
    // =====================================================

    if (isMultipart) {
      const formData =
        await request.formData()

      imageFile =
        formData.get(
          'image_file'
        ) instanceof File
          ? (formData.get(
              'image_file'
            ) as File)
          : null

      payload =
        createProductSchema.parse(
          {
            game_id: String(
              formData.get(
                'game_id'
              ) || ''
            ).trim(),

            category_id: String(
              formData.get(
                'category_id'
              ) || ''
            ).trim(),

            name: String(
              formData.get(
                'name'
              ) || ''
            ).trim(),

            points_price:
              formData.get(
                'points_price'
              ),

            description:
              String(
                formData.get(
                  'description'
                ) || ''
              ).trim() ||
              undefined,
          }
        )
    } else {
      const body =
        await request.json()

      payload =
        createProductSchema.parse(
          body
        )
    }

    // =====================================================
    // VALIDATE CATEGORY
    // =====================================================

    const {
      data: categoryExists,
      error: categoryError,
    } = await supabase
      .from('categories')
      .select('id')
      .eq(
        'id',
        payload.category_id
      )
      .eq(
        'game_id',
        payload.game_id
      )
      .maybeSingle()

    if (categoryError) {
      return NextResponse.json(
        {
          error:
            categoryError.message,
        },
        { status: 500 }
      )
    }

    if (!categoryExists) {
      return NextResponse.json(
        {
          error:
            'Category does not belong to selected game',
        },
        { status: 400 }
      )
    }

    // =====================================================
    // IMAGE UPLOAD
    // =====================================================

    let imageUrl =
      payload.image_url || ''

    if (isMultipart && imageFile) {
      if (
        !ALLOWED_IMAGE_TYPES.has(
          imageFile.type
        )
      ) {
        return NextResponse.json(
          {
            error:
              'Invalid image type',
          },
          { status: 400 }
        )
      }

      if (
        imageFile.size >
        MAX_IMAGE_SIZE_BYTES
      ) {
        return NextResponse.json(
          {
            error:
              'Image too large',
          },
          { status: 400 }
        )
      }

      if (!supabaseAdmin) {
        return NextResponse.json(
          {
            error:
              'Storage unavailable',
          },
          { status: 500 }
        )
      }

      await ensureBucket(
        supabaseAdmin,
        'products',
        '25MB'
      )

      const originalName =
        sanitizeStorageFileName(
          imageFile.name
        )

      const storagePath = `products/${Date.now()}-${originalName}`

      const bytes =
        await imageFile.arrayBuffer()

      const uploadResult =
        await supabaseAdmin.storage
          .from('products')
          .upload(
            storagePath,
            Buffer.from(bytes),
            {
              contentType:
                imageFile.type,
            }
          )

      if (uploadResult.error) {
        return NextResponse.json(
          {
            error:
              uploadResult.error
                .message,
          },
          { status: 500 }
        )
      }

      const {
        data: publicUrlData,
      } =
        supabaseAdmin.storage
          .from('products')
          .getPublicUrl(
            storagePath
          )

      imageUrl =
        publicUrlData.publicUrl
    }

    // =====================================================
    // CREATE PRODUCT
    // =====================================================

    const productPayload = {
      game_id:
        payload.game_id,

      category_id:
        payload.category_id,

      name: payload.name,

      description:
        payload.description ||
        null,

      image_url:
        imageUrl || null,

      points_price:
        payload.points_price,

      is_active: true,

      status:
        auth.role === 'admin'
          ? 'approved'
          : 'pending',
    }

    const {
      data: productInsert,
      error: insertError,
    } = await supabase
      .from('products')
      .insert(productPayload)
      .select()
      .single()

    if (
      insertError ||
      !productInsert
    ) {
      console.error(
        'Create product error:',
        insertError
      )

      return NextResponse.json(
        {
          error:
            insertError?.message ||
            'Failed to create product',
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,

        product:
          productInsert,
      },
      { status: 201 }
    )
  } catch (error) {
    if (
      error instanceof z.ZodError
    ) {
      return NextResponse.json(
        {
          error:
            'Validation error',

          details:
            error.errors,
        },
        { status: 400 }
      )
    }

    console.error(
      'Create product error:',
      error
    )

    return NextResponse.json(
      {
        error:
          'Internal server error',
      },
      { status: 500 }
    )
  }
}
