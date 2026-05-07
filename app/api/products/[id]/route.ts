import { NextRequest, NextResponse } from 'next/server'

import {
  supabaseServer as supabase,
} from '@/lib/db'

import { verifyToken } from '@/lib/auth'

import { z } from 'zod'

const updateProductSchema = z.object({
  game_id: z.string().uuid().optional(),

  category_id: z.string().uuid().optional(),

  name: z.string().min(1).optional(),

  description: z.string().optional(),

  image_url: z.string().url().optional(),

  points_price: z.coerce
    .number()
    .int()
    .positive()
    .optional(),

  status: z
    .enum([
      'pending',
      'approved',
      'rejected',
    ])
    .optional(),

  is_active:
    z.boolean().optional(),
})

function getAuth(
  request: NextRequest
) {
  const authHeader =
    request.headers.get(
      'authorization'
    )

  if (
    !authHeader?.startsWith(
      'Bearer '
    )
  ) {
    return null
  }

  return verifyToken(
    authHeader.substring(7)
  )
}

// =====================================================
// GET SINGLE PRODUCT
// =====================================================

export async function GET(
  request: NextRequest,
  context: {
    params: {
      id: string
    }
  }
) {
  try {
    const productId =
      context.params.id

    const {
      data: product,
      error,
    } = await supabase
      .from('products')
      .select(`
        id,
        game_id,
        category_id,
        name,
        description,
        image_url,
        points_price,
        status,
        is_active,
        created_at
      `)
      .eq('id', productId)
      .single()

    if (error || !product) {
      console.error(
        'Get product error:',
        error
      )

      return NextResponse.json(
        {
          error:
            'Product not found',
        },
        { status: 404 }
      )
    }

    // =====================================================
    // LOAD GAME
    // =====================================================

    let game = null

    if (product.game_id) {
      const {
        data: gameData,
      } = await supabase
        .from('games')
        .select('id, name')
        .eq(
          'id',
          product.game_id
        )
        .single()

      game = gameData ?? null
    }

    // =====================================================
    // LOAD CATEGORY
    // =====================================================

    let category = null

    if (product.category_id) {
      const {
        data: categoryData,
      } = await supabase
        .from('categories')
        .select('id, name')
        .eq(
          'id',
          product.category_id
        )
        .single()

      category =
        categoryData ?? null
    }

    return NextResponse.json({
      success: true,

      product: {
        ...product,

        game,

        category,
      },
    })
  } catch (error) {
    console.error(
      'Get product error:',
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

// =====================================================
// UPDATE PRODUCT
// =====================================================

export async function PATCH(
  request: NextRequest,
  context: {
    params: {
      id: string
    }
  }
) {
  try {
    const auth =
      getAuth(request)

    if (!auth) {
      return NextResponse.json(
        {
          error:
            'Unauthorized',
        },
        { status: 401 }
      )
    }

    if (
      auth.role !== 'admin'
    ) {
      return NextResponse.json(
        {
          error:
            'Only admins can update products',
        },
        { status: 403 }
      )
    }

    const productId =
      context.params.id

    const body =
      await request.json()

    const payload =
      updateProductSchema.parse(
        body
      )

    // =====================================================
    // VALIDATE CATEGORY/GAME
    // =====================================================

    if (
      payload.category_id &&
      payload.game_id
    ) {
      const {
        data: category,
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

      if (!category) {
        return NextResponse.json(
          {
            error:
              'Category does not belong to selected game',
          },
          { status: 400 }
        )
      }
    }

    const {
      data: updatedProduct,
      error,
    } = await supabase
      .from('products')
      .update(payload)
      .eq('id', productId)
      .select(`
        id,
        game_id,
        category_id,
        name,
        description,
        image_url,
        points_price,
        status,
        is_active,
        created_at
      `)
      .single()

    if (
      error ||
      !updatedProduct
    ) {
      console.error(
        'Update product error:',
        error
      )

      return NextResponse.json(
        {
          error:
            error?.message ||
            'Failed to update product',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,

      product:
        updatedProduct,
    })
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
      'Update product error:',
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

// =====================================================
// DELETE PRODUCT
// =====================================================

export async function DELETE(
  request: NextRequest,
  context: {
    params: {
      id: string
    }
  }
) {
  try {
    const auth =
      getAuth(request)

    if (!auth) {
      return NextResponse.json(
        {
          error:
            'Unauthorized',
        },
        { status: 401 }
      )
    }

    if (
      auth.role !== 'admin'
    ) {
      return NextResponse.json(
        {
          error:
            'Only admins can delete products',
        },
        { status: 403 }
      )
    }

    const productId =
      context.params.id

    const {
      error,
    } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)

    if (error) {
      console.error(
        'Delete product error:',
        error
      )

      return NextResponse.json(
        {
          error:
            error.message,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
    })
  } catch (error) {
    console.error(
      'Delete product error:',
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
