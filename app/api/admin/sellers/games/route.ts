import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

function isUUID(value: string) {
  return /^[0-9a-fA-F-]{36}$/.test(value)
}

export async function GET(request: NextRequest) {
  try {
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
      return NextResponse.json(
        {
          error:
            'Unauthorized',
        },
        { status: 401 }
      )
    }

    const token =
      authHeader.substring(7)

    const auth =
      verifyToken(token)

    if (
      !auth ||
      auth.role !== 'admin'
    ) {
      return NextResponse.json(
        {
          error:
            'Admin only',
        },
        { status: 403 }
      )
    }

    const { searchParams } =
      new URL(request.url)

    const sellerId =
      searchParams.get(
        'sellerId'
      )

    if (
      !sellerId ||
      !isUUID(sellerId)
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid seller id',
        },
        { status: 400 }
      )
    }

    // ============================================
    // LOAD ASSIGNED CATEGORIES
    // ============================================

    const {
      data: assignments,
      error:
        assignmentsError,
    } = await supabase
      .from(
        'seller_categories'
      )
      .select(`
        category_id
      `)
      .eq(
        'seller_id',
        sellerId
      )

    if (
      assignmentsError
    ) {
      console.error(
        assignmentsError
      )

      return NextResponse.json(
        {
          error:
            assignmentsError.message,
        },
        { status: 500 }
      )
    }

    const categoryIds =
      (
        assignments ?? []
      ).map(
        (item: any) =>
          item.category_id
      )

    // ============================================
    // LOAD CATEGORIES
    // ============================================

    const {
      data: categories,
      error:
        categoriesError,
    } = await supabase
      .from('categories')
      .select(`
        id,
        name,
        game_id,
        games (
          id,
          name
        )
      `)
      .order('name')

    if (
      categoriesError
    ) {
      console.error(
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

    return NextResponse.json({
      success: true,

      categories:
        (
          categories ??
          []
        ).map(
          (
            category: any
          ) => ({
            id: category.id,

            name:
              category.name,

            game_id:
              category.game_id,

            game_name:
              category.games
                ?.name ??
              'Unknown',

            assigned:
              categoryIds.includes(
                category.id
              ),
          })
        ),
    })
  } catch (error) {
    console.error(error)

    return NextResponse.json(
      {
        error:
          'Internal server error',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
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
      return NextResponse.json(
        {
          error:
            'Unauthorized',
        },
        { status: 401 }
      )
    }

    const token =
      authHeader.substring(7)

    const auth =
      verifyToken(token)

    if (
      !auth ||
      auth.role !== 'admin'
    ) {
      return NextResponse.json(
        {
          error:
            'Admin only',
        },
        { status: 403 }
      )
    }

    const body =
      await request.json()

    const sellerId =
      body.seller_id

    const categoryIds =
      body.category_ids ?? []

    if (
      !sellerId ||
      !isUUID(sellerId)
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid seller id',
        },
        { status: 400 }
      )
    }

    // ============================================
    // DELETE OLD ASSIGNMENTS
    // ============================================

    const {
      error: deleteError,
    } = await supabase
      .from(
        'seller_categories'
      )
      .delete()
      .eq(
        'seller_id',
        sellerId
      )

    if (deleteError) {
      console.error(
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

    // ============================================
    // INSERT NEW ASSIGNMENTS
    // ============================================

    if (
      categoryIds.length > 0
    ) {
      const rows =
        categoryIds.map(
          (
            categoryId: string
          ) => ({
            seller_id:
              sellerId,

            category_id:
              categoryId,
          })
        )

      const {
        error: insertError,
      } = await supabase
        .from(
          'seller_categories'
        )
        .insert(rows)

      if (insertError) {
        console.error(
          insertError
        )

        return NextResponse.json(
          {
            error:
              insertError.message,
          },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
    })
  } catch (error) {
    console.error(error)

    return NextResponse.json(
      {
        error:
          'Internal server error',
      },
      { status: 500 }
    )
  }
}
