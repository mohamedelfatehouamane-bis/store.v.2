import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as supabase } from '@/lib/db'
import { buildTrustSummary } from '@/lib/trust-score'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const sort =
      searchParams.get('sort') ||
      'rating'

    const limit = Math.min(
      parseInt(
        searchParams.get('limit') ||
          '20'
      ),
      100
    )

    const gameId =
      searchParams.get('gameId')

    // =====================================================
    // LOAD SELLER USERS
    // =====================================================

    const {
      data: users,
      error: usersError,
    } = await supabase
      .from('users')
      .select(`
        id,
        username,
        avatar_url,
        points,
        role,
        status,
        is_active,
        rating,
        total_reviews,
        completed_orders,
        dispute_count
      `)
      .eq('role', 'seller')
      .eq('status', 'approved')
      .eq('is_active', true)
      .limit(limit * 3)

    if (usersError) {
      console.error(
        'Get sellers users error:',
        usersError
      )

      return NextResponse.json(
        {
          error:
            usersError.message,
        },
        { status: 500 }
      )
    }

    const userIds =
      (users ?? []).map(
        (user: any) =>
          String(user.id)
      )

    if (userIds.length === 0) {
      return NextResponse.json({
        success: true,
        sellers: [],
      })
    }

    // =====================================================
    // LOAD SELLER PROFILES
    // =====================================================

    const {
      data: sellerProfiles,
      error: sellerProfilesError,
    } = await supabase
      .from('sellers')
      .select(`
        id,
        user_id,
        business_name,
        business_description,
        total_tasks_completed,
        average_rating,
        fee_percentage
      `)
      .in('user_id', userIds)

    if (
      sellerProfilesError
    ) {
      console.error(
        'Get seller profiles error:',
        sellerProfilesError
      )

      return NextResponse.json(
        {
          error:
            sellerProfilesError.message,
        },
        { status: 500 }
      )
    }

    const profileByUserId =
      new Map(
        (
          sellerProfiles ?? []
        ).map(
          (profile: any) => [
            String(
              profile.user_id
            ),
            profile,
          ]
        )
      )

    // =====================================================
    // LOAD CATEGORY ASSIGNMENTS
    // =====================================================

    const {
      data: assignments,
      error: assignmentsError,
    } = await supabase
      .from(
        'seller_categories'
      )
      .select(`
        seller_id,
        category_id
      `)
      .in(
        'seller_id',
        userIds
      )

    if (
      assignmentsError
    ) {
      console.error(
        'Get seller assignments error:',
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

    // =====================================================
    // LOAD CATEGORIES
    // =====================================================

    const categoryIds =
      Array.from(
        new Set(
          (
            assignments ??
            []
          ).map(
            (assignment: any) =>
              assignment.category_id
          )
        )
      )

    let categories: any[] = []

    if (
      categoryIds.length > 0
    ) {
      const {
        data:
          categoriesData,
      } = await supabase
        .from('categories')
        .select(`
          id,
          name,
          game_id
        `)
        .in(
          'id',
          categoryIds
        )

      categories =
        categoriesData ?? []
    }

    const categoryMap =
      new Map(
        categories.map(
          (category: any) => [
            String(category.id),
            category,
          ]
        )
      )

    // =====================================================
    // LOAD GAMES
    // =====================================================

    const gameIds =
      Array.from(
        new Set(
          categories.map(
            (category: any) =>
              category.game_id
          )
        )
      )

    let games: any[] = []

    if (gameIds.length > 0) {
      const {
        data: gamesData,
      } = await supabase
        .from('games')
        .select(`
          id,
          name
        `)
        .in(
          'id',
          gameIds
        )

      games =
        gamesData ?? []
    }

    const gameMap =
      new Map(
        games.map(
          (game: any) => [
            String(game.id),
            game.name,
          ]
        )
      )

    // =====================================================
    // BUILD MAPS
    // =====================================================

    const categoriesBySeller =
      new Map<
        string,
        any[]
      >()

    const gamesBySeller =
      new Map<
        string,
        any[]
      >()

    for (const assignment of assignments ??
      []) {
      const sellerId = String(
        assignment.seller_id
      )

      const category =
        categoryMap.get(
          String(
            assignment.category_id
          )
        )

      if (!category)
        continue

      // categories

      const currentCategories =
        categoriesBySeller.get(
          sellerId
        ) ?? []

      currentCategories.push({
        id: category.id,
        name: category.name,
      })

      categoriesBySeller.set(
        sellerId,
        currentCategories
      )

      // games

      const gameName =
        gameMap.get(
          String(
            category.game_id
          )
        )

      if (gameName) {
        const currentGames =
          gamesBySeller.get(
            sellerId
          ) ?? []

        if (
          !currentGames.includes(
            gameName
          )
        ) {
          currentGames.push(
            gameName
          )
        }

        gamesBySeller.set(
          sellerId,
          currentGames
        )
      }
    }

    // =====================================================
    // LOAD ACTIVE ORDERS
    // =====================================================

    const {
      data: activeOrders,
      error: activeOrdersError,
    } = await supabase
      .from('orders')
      .select(
        'assigned_seller_id'
      )
      .eq(
        'status',
        'in_progress'
      )
      .in(
        'assigned_seller_id',
        userIds
      )

    if (
      activeOrdersError
    ) {
      console.error(
        'Get active orders error:',
        activeOrdersError
      )

      return NextResponse.json(
        {
          error:
            activeOrdersError.message,
        },
        { status: 500 }
      )
    }

    const activeOrdersMap =
      new Map<
        string,
        number
      >()

    ;(
      activeOrders ?? []
    ).forEach(
      (order: any) => {
        const sellerId =
          String(
            order.assigned_seller_id
          )

        activeOrdersMap.set(
          sellerId,
          (
            activeOrdersMap.get(
              sellerId
            ) ?? 0
          ) + 1
        )
      }
    )

    // =====================================================
    // BUILD SELLERS
    // =====================================================

    let sellers =
      (users ?? [])
        .map((user: any) => {
          const profile =
            profileByUserId.get(
              String(user.id)
            )

          if (!profile)
            return null

          const rating =
            Number(
              user.rating ??
                profile.average_rating ??
                0
            )

          const completedOrders =
            Number(
              user.completed_orders ??
                profile.total_tasks_completed ??
                0
            )

          const disputeCount =
            Number(
              user.dispute_count ??
                0
            )

          const trust =
            buildTrustSummary({
              rating,

              completed_orders:
                completedOrders,

              dispute_count:
                disputeCount,
            })

          return {
            id: String(user.id),

            username:
              user.username,

            avatar_url:
              user.avatar_url,

            total_points:
              Number(
                user.points ?? 0
              ),

            business_name:
              profile.business_name,

            business_description:
              profile.business_description,

            total_tasks_completed:
              completedOrders,

            completed_orders:
              completedOrders,

            average_rating:
              rating,

            rating,

            total_reviews:
              Number(
                user.total_reviews ??
                  0
              ),

            dispute_count:
              disputeCount,

            fee_percentage:
              Number(
                profile.fee_percentage ??
                  10
              ),

            active_orders:
              activeOrdersMap.get(
                String(user.id)
              ) ?? 0,

            assigned_categories:
              categoriesBySeller.get(
                String(user.id)
              ) ?? [],

            assigned_games:
              gamesBySeller.get(
                String(user.id)
              ) ?? [],

            trust_score:
              trust.trust_score,

            trust_badge:
              trust.trust_badge,

            is_risky:
              trust.is_risky,
          }
        })
        .filter(Boolean) as any[]

    // =====================================================
    // FILTER
    // =====================================================

    if (gameId) {
      sellers = sellers.filter(
        (seller) =>
          seller.assigned_games
            .length > 0
      )
    }

    // =====================================================
    // SORT
    // =====================================================

    if (sort === 'trust') {
      sellers.sort(
        (a, b) =>
          b.trust_score -
          a.trust_score
      )
    } else if (
      sort === 'tasks'
    ) {
      sellers.sort(
        (a, b) =>
          b.total_tasks_completed -
          a.total_tasks_completed
      )
    } else if (
      sort === 'points'
    ) {
      sellers.sort(
        (a, b) =>
          b.total_points -
          a.total_points
      )
    } else {
      sellers.sort(
        (a, b) =>
          b.average_rating -
          a.average_rating
      )
    }

    sellers = sellers.slice(
      0,
      limit
    )

    return NextResponse.json({
      success: true,
      sellers,
    })
  } catch (error) {
    console.error(
      'Get sellers error:',
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
