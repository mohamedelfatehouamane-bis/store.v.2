import { NextRequest, NextResponse } from 'next/server'

import {
  supabaseServer as supabase,
  supabaseAdmin,
} from '@/lib/db'

import {
  verifyToken,
  resolveUserId,
} from '@/lib/auth'

function isUUID(
  value: string
) {
  return /^[0-9a-fA-F-]{36}$/.test(
    value
  )
}

export async function GET(
  request: NextRequest
) {
  try {
    // =====================================================
    // AUTH
    // =====================================================

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

    if (!auth) {
      return NextResponse.json(
        {
          error:
            'Unauthorized',
        },
        { status: 401 }
      )
    }

    const db =
      supabaseAdmin ??
      supabase

    const resolvedUserId =
      await resolveUserId(
        auth,
        db
      )

    if (
      !resolvedUserId ||
      !isUUID(
        resolvedUserId
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid user id',
        },
        { status: 400 }
      )
    }

    // =====================================================
    // USER
    // =====================================================

    const {
      data: user,
      error: userError,
    } = await db
      .from('users')
      .select(`
        id,
        username,
        email,
        role,
        points,
        balance,
        status,
        created_at
      `)
      .eq(
        'id',
        resolvedUserId
      )
      .single()

    if (
      userError ||
      !user
    ) {
      console.error(
        userError
      )

      return NextResponse.json(
        {
          error:
            'User not found',
        },
        { status: 404 }
      )
    }

    let sellerData: any =
      null

    // =====================================================
    // SELLER INFO
    // =====================================================

    if (
      user.role ===
      'seller'
    ) {
      const {
        data: assignments,
      } = await db
        .from(
          'seller_categories'
        )
        .select(`
          category_id,
          categories (
            id,
            name,
            game_id,
            games (
              id,
              name
            )
          )
        `)
        .eq(
          'seller_id',
          resolvedUserId
        )

      const assigned_categories =
        (
          assignments ??
          []
        ).map(
          (
            item: any
          ) =>
            item.categories
              ?.name
        )

      const assigned_category_ids =
        (
          assignments ??
          []
        ).map(
          (
            item: any
          ) =>
            item.category_id
        )

      sellerData = {
        business_name:
          user.username,

        business_description:
          null,

        assigned_categories,

        assigned_category_ids,

        average_rating: 0,

        total_reviews: 0,
      }
    }

    // =====================================================
    // RESPONSE
    // =====================================================

    return NextResponse.json(
      {
        success: true,

        user: {
          ...user,

          total_points:
            Number(
              user.points ??
                0
            ),

          balance:
            Number(
              user.balance ??
                user.points ??
                0
            ),

          ...sellerData,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error(
      'Profile API error:',
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
