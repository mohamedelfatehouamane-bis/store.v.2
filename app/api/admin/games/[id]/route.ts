import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

async function requireAdmin(
  request: NextRequest
) {
  const authHeader =
    request.headers.get(
      'authorization'
    )

  if (
    !authHeader ||
    !authHeader.startsWith(
      'Bearer '
    )
  ) {
    return {
      error:
        NextResponse.json(
          {
            error:
              'Unauthorized',
          },
          { status: 401 }
        ),
    }
  }

  const token =
    authHeader.substring(7)

  const auth =
    verifyToken(token)

  if (
    !auth ||
    auth.role !== 'admin'
  ) {
    return {
      error:
        NextResponse.json(
          {
            error:
              'Only admins can delete games',
          },
          { status: 403 }
        ),
    }
  }

  return { auth }
}

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string
    }>
  }
) {
  try {
    // =====================================================
    // ADMIN
    // =====================================================

    const authResult =
      await requireAdmin(
        request
      )

    if (
      'error' in authResult
    ) {
      return authResult.error
    }

    // =====================================================
    // GAME ID
    // =====================================================

    const { id: gameId } =
      await params

    if (!gameId) {
      return NextResponse.json(
        {
          error:
            'Missing game id',
        },
        { status: 400 }
      )
    }

    // =====================================================
    // GAME
    // =====================================================

    const {
      data: game,
      error: gameError,
    } = await supabase
      .from('games')
      .select(`
        id,
        name
      `)
      .eq('id', gameId)
      .maybeSingle()

    if (gameError) {
      console.error(
        'Lookup game error:',
        gameError
      )

      return NextResponse.json(
        {
          error:
            gameError.message,
        },
        { status: 500 }
      )
    }

    if (!game) {
      return NextResponse.json(
        {
          error:
            'Game not found',
        },
        { status: 404 }
      )
    }

    // =====================================================
    // LOAD CATEGORIES
    // =====================================================

    const {
      data: categories,
      error: categoriesError,
    } = await supabase
      .from('categories')
      .select(`
        id
      `)
      .eq('game_id', gameId)

    if (categoriesError) {
      console.error(
        'Fetch categories error:',
        categoriesError
      )

      return NextResponse.json(
        {
          error:
            categoriesError.message,
        },
        { status: 500 }
      )
    }

    const categoryIds =
      (
        categories ?? []
      ).map(
        (category: any) =>
          category.id
      )

    // =====================================================
    // LOAD PRODUCTS
    // =====================================================

    let productIds: string[] =
      []

    if (
      categoryIds.length > 0
    ) {
      const {
        data: productsData,
        error: productsError,
      } = await supabase
        .from('products')
        .select(`
          id
        `)
        .in(
          'category_id',
          categoryIds
        )

      if (productsError) {
        console.error(
          'Fetch products error:',
          productsError
        )

        return NextResponse.json(
          {
            error:
              productsError.message,
          },
          { status: 500 }
        )
      }

      productIds = Array.from(
        new Set(
          (
            productsData ??
            []
          ).map(
            (product: any) =>
              String(
                product.id
              )
          )
        )
      )
    }

    // =====================================================
    // CHECK ACTIVE ORDERS
    // =====================================================

    let activeOrderCount = 0

    if (
      productIds.length > 0
    ) {
      const {
        count,
        error:
          ordersError,
      } = await supabase
        .from('orders')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .in(
          'product_id',
          productIds
        )

      if (ordersError) {
        console.error(
          'Fetch orders count error:',
          ordersError
        )

        return NextResponse.json(
          {
            error:
              ordersError.message,
          },
          { status: 500 }
        )
      }

      activeOrderCount =
        count ?? 0
    }

    if (
      activeOrderCount > 0
    ) {
      return NextResponse.json(
        {
          error:
            'Cannot delete game with active orders',
        },
        { status: 400 }
      )
    }

    // =====================================================
    // DELETE SELLER CATEGORY ASSIGNMENTS
    // =====================================================

    if (
      categoryIds.length > 0
    ) {
      const {
        error:
          deleteAssignmentsError,
      } = await supabase
        .from(
          'seller_categories'
        )
        .delete()
        .in(
          'category_id',
          categoryIds
        )

      if (
        deleteAssignmentsError
      ) {
        console.error(
          'Delete seller category assignments error:',
          deleteAssignmentsError
        )

        return NextResponse.json(
          {
            error:
              deleteAssignmentsError.message,
          },
          { status: 500 }
        )
      }
    }

    // =====================================================
    // DELETE PRODUCTS
    // =====================================================

    if (
      categoryIds.length > 0
    ) {
      const {
        error:
          deleteProductsError,
      } = await supabase
        .from('products')
        .delete()
        .in(
          'category_id',
          categoryIds
        )

      if (
        deleteProductsError
      ) {
        console.error(
          'Delete products error:',
          deleteProductsError
        )

        return NextResponse.json(
          {
            error:
              deleteProductsError.message,
          },
          { status: 500 }
        )
      }
    }

    // =====================================================
    // DELETE CATEGORIES
    // =====================================================

    const {
      error:
        deleteCategoriesError,
    } = await supabase
      .from('categories')
      .delete()
      .eq('game_id', gameId)

    if (
      deleteCategoriesError
    ) {
      console.error(
        'Delete categories error:',
        deleteCategoriesError
      )

      return NextResponse.json(
        {
          error:
            deleteCategoriesError.message,
        },
        { status: 500 }
      )
    }

    // =====================================================
    // DELETE GAME ACCOUNTS
    // =====================================================

    const {
      error:
        deleteGameAccountsError,
    } = await supabase
      .from('game_accounts')
      .delete()
      .eq('game_id', gameId)

    if (
      deleteGameAccountsError
    ) {
      console.error(
        'Delete game accounts error:',
        deleteGameAccountsError
      )

      return NextResponse.json(
        {
          error:
            deleteGameAccountsError.message,
        },
        { status: 500 }
      )
    }

    // =====================================================
    // DELETE GAME
    // =====================================================

    const {
      error: deleteError,
    } = await supabase
      .from('games')
      .delete()
      .eq('id', gameId)

    if (deleteError) {
      console.error(
        'Delete game error:',
        deleteError
      )

      return NextResponse.json(
        {
          error:
            deleteError.message,
        },
        { status: 500 }
      )
    }

    // =====================================================
    // SUCCESS
    // =====================================================

    return NextResponse.json({
      success: true,

      message: `Game "${game.name}" deleted successfully`,
    })
  } catch (error) {
    console.error(
      'Delete game API error:',
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
