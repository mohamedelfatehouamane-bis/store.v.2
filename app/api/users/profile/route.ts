import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseServer as supabase,
  supabaseAdmin,
} from '@/lib/db'

import { verifyToken } from '@/lib/auth'

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
            'Missing authorization token',
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
            'Invalid or expired token',
        },
        { status: 401 }
      )
    }

    // =====================================================
    // USER
    // =====================================================

    const {
      data: user,
      error,
    } = await supabase
      .from('users')
      .select('*')
      .eq('id', auth.id)
      .single()

    let resolvedUser = user

    // =====================================================
    // FALLBACK EMAIL LOOKUP
    // =====================================================

    if (
      (error || !user) &&
      auth.email
    ) {
      const {
        data: byEmail,
      } = await supabase
        .from('users')
        .select('*')
        .eq(
          'email',
          auth.email
        )
        .maybeSingle()

      resolvedUser =
        byEmail ?? null

      if (
        !resolvedUser &&
        supabaseAdmin
      ) {
        try {
          const {
            data:
              authUserLookup,
          } =
            await supabaseAdmin.auth.admin.getUserByEmail(
              auth.email
            )

          if (
            authUserLookup
              ?.user?.id &&
            authUserLookup.user
              .id !== auth.id
          ) {
            const {
              data: byAuthUid,
            } = await supabase
              .from('users')
              .select('*')
              .eq(
                'id',
                authUserLookup
                  .user.id
              )
              .maybeSingle()

            resolvedUser =
              byAuthUid ??
              null
          }
        } catch {
          // ignore
        }
      }
    }

    if (!resolvedUser) {
      console.error(
        'Profile query error:',
        error
      )

      return NextResponse.json(
        {
          error:
            'User not found',
        },
        { status: 404 }
      )
    }

    // =====================================================
    // DEFAULTS
    // =====================================================

    let status =
      resolvedUser.status ??
      'pending'

    let rejection_reason:
      | string
      | null = null

    let business_description:
      | string
      | null = null

    let business_name:
      | string
      | null = null

    let assigned_categories:
      string[] = []

    let assigned_category_ids:
      string[] = []

    let assigned_games:
      string[] = []

    let average_rating = 0

    let total_reviews = 0

    let fee_percentage = 10

    // =====================================================
    // SELLER DATA
    // =====================================================

    if (
      resolvedUser.role ===
      'seller'
    ) {
      const {
        data: seller,
        error:
          sellerError,
      } = await supabase
        .from('sellers')
        .select(`
          id,
          business_name,
          business_description,
          rejection_reason,
          average_rating,
          total_reviews,
          fee_percentage
        `)
        .eq(
          'user_id',
          resolvedUser.id
        )
        .single()

      if (
        !sellerError &&
        seller
      ) {
        rejection_reason =
          seller.rejection_reason ??
          null

        business_name =
          seller.business_name ??
          null

        business_description =
          seller.business_description ??
          null

        average_rating =
          Number(
            seller.average_rating ??
              0
          )

        total_reviews =
          Number(
            seller.total_reviews ??
              0
          )

        fee_percentage =
          Number(
            seller.fee_percentage ??
              10
          )

        // =====================================================
        // CATEGORY ASSIGNMENTS
        // =====================================================

        const {
          data:
            sellerCategories,
          error:
            sellerCategoriesError,
        } = await supabase
          .from(
            'seller_categories'
          )
          .select(`
            category_id
          `)
          .eq(
            'seller_id',
            resolvedUser.id
          )

        if (
          !sellerCategoriesError
        ) {
          const categoryIds =
            (
              sellerCategories ??
              []
            ).map(
              (
                item: any
              ) =>
                item.category_id
            )

          assigned_category_ids =
            categoryIds

          if (
            categoryIds.length >
            0
          ) {
            const {
              data:
                categoriesData,
              error:
                categoriesError,
            } = await supabase
              .from(
                'categories'
              )
              .select(`
                id,
                name,
                game_id
              `)
              .in(
                'id',
                categoryIds
              )

            if (
              !categoriesError &&
              categoriesData
            ) {
              assigned_categories =
                (
                  categoriesData as any[]
                ).map(
                  (
                    category
                  ) =>
                    category.name
                )

              const gameIds =
                Array.from(
                  new Set(
                    (
                      categoriesData as any[]
                    ).map(
                      (
                        category
                      ) =>
                        category.game_id
                    )
                  )
                )

              if (
                gameIds.length >
                0
              ) {
                const {
                  data:
                    gamesData,
                } = await supabase
                  .from(
                    'games'
                  )
                  .select(`
                    id,
                    name
                  `)
                  .in(
                    'id',
                    gameIds
                  )

                assigned_games =
                  (
                    gamesData ??
                    []
                  ).map(
                    (
                      game: any
                    ) =>
                      game.name
                  )
              }
            }
          }
        }
      }
    }

    // =====================================================
    // RESPONSE
    // =====================================================

    const normalizedUser =
      {
        ...resolvedUser,

        total_points:
          Number(
            resolvedUser.points ??
              0
          ),

        balance: Number(
          resolvedUser.balance ??
            resolvedUser.points ??
            0
        ),

        is_verified:
          resolvedUser.is_verified ??
          false,

        status,

        rejection_reason,

        business_name,

        business_description,

        average_rating,

        total_reviews,

        fee_percentage,

        assigned_categories,

        assigned_category_ids,

        assigned_games,
      }

    return NextResponse.json({
      success: true,

      user: normalizedUser,
    })
  } catch (error) {
    console.error(
      'Profile error:',
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
