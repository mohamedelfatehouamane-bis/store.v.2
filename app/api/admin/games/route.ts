import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { z } from 'zod'

const createGameSchema = z.object({
  name: z.string().trim().min(1).max(100),
})

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
}

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
      error: NextResponse.json(
        {
          error: 'Unauthorized',
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
      error: NextResponse.json(
        {
          error:
            'Only admins can access games',
        },
        { status: 403 }
      ),
    }
  }

  return { auth }
}

// ======================================================
// GET GAMES
// ======================================================

export async function GET(
  request: NextRequest
) {
  try {
    const authResult =
      await requireAdmin(request)

    if ('error' in authResult) {
      return authResult.error
    }

    // =========================
    // FETCH GAMES
    // =========================

    const {
      data: games,
      error: gamesError,
    } = await supabase
      .from('games')
      .select(`
        id,
        name,
        slug,
        created_at
      `)
      .order('created_at', {
        ascending: false,
      })

    if (gamesError) {
      console.error(
        'Games error:',
        gamesError
      )

      return NextResponse.json(
        {
          error:
            gamesError.message,
        },
        { status: 500 }
      )
    }

    // =========================
    // FETCH CATEGORIES
    // =========================

    const {
      data: categories,
      error: categoriesError,
    } = await supabase
      .from('categories')
      .select(`
        id,
        name,
        game_id
      `)

    if (categoriesError) {
      console.error(
        'Categories error:',
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

    // =========================
    // FETCH SELLER ASSIGNMENTS
    // =========================

    let assignments: any[] = []

    const assignmentsResponse =
      await supabase
        .from('seller_categories')
        .select(`
          category_id,
          seller_id
        `)

    if (
      assignmentsResponse.error
    ) {
      console.error(
        'seller_categories error:',
        assignmentsResponse.error
      )

      assignments = []
    } else {
      assignments =
        assignmentsResponse.data ??
        []
    }

    // =========================
    // FETCH SELLERS
    // =========================

    const {
      data: sellers,
      error: sellersError,
    } = await supabase
      .from('users')
      .select(`
        id,
        username,
        email
      `)
      .eq('role', 'seller')

    if (sellersError) {
      console.error(
        'Sellers error:',
        sellersError
      )

      return NextResponse.json(
        {
          error:
            sellersError.message,
        },
        { status: 500 }
      )
    }

    // =========================
    // MAP SELLERS
    // =========================

    const sellersById =
      new Map(
        (sellers ?? []).map(
          (seller: any) => [
            String(seller.id),
            seller,
          ]
        )
      )

    const categoriesByGame =
      new Map<string, any[]>()

    for (const category of categories ?? []) {
      const gameId = String(
        category.game_id
      )

      const current =
        categoriesByGame.get(
          gameId
        ) ?? []

      current.push(category)

      categoriesByGame.set(
        gameId,
        current
      )
    }

    const assignmentsByCategory =
      new Map<string, any[]>()

    for (const assignment of assignments) {
      const categoryId = String(
        assignment.category_id
      )

      const seller =
        sellersById.get(
          String(
            assignment.seller_id
          )
        )

      if (!seller) continue

      const current =
        assignmentsByCategory.get(
          categoryId
        ) ?? []

      current.push({
        id: String(seller.id),

        username:
          seller.username,

        email: seller.email,
      })

      assignmentsByCategory.set(
        categoryId,
        current
      )
    }

    // =========================
    // BUILD RESPONSE
    // =========================

    const normalizedGames =
      (games ?? []).map(
        (game: any) => {
          const gameCategories =
            categoriesByGame.get(
              String(game.id)
            ) ?? []

          let assignedSellers: any[] =
            []

          for (const category of gameCategories) {
            const categoryAssignments =
              assignmentsByCategory.get(
                String(category.id)
              ) ?? []

            assignedSellers.push(
              ...categoryAssignments
            )
          }

          // REMOVE DUPLICATES

          assignedSellers =
            Array.from(
              new Map(
                assignedSellers.map(
                  (seller) => [
                    seller.id,
                    seller,
                  ]
                )
              ).values()
            )

          return {
            id: String(game.id),

            name: game.name,

            slug:
              game.slug ??
              slugify(game.name),

            categories_count:
              gameCategories.length,

            assigned_sellers_count:
              assignedSellers.length,

            assigned_sellers:
              assignedSellers,
          }
        }
      )

    return NextResponse.json({
      success: true,
      games: normalizedGames,
    })
  } catch (error) {
    console.error(
      'Get admin games error:',
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

// ======================================================
// CREATE GAME
// ======================================================

export async function POST(
  request: NextRequest
) {
  try {
    const authResult =
      await requireAdmin(request)

    if ('error' in authResult) {
      return authResult.error
    }

    const body =
      await request.json()

    const { name } =
      createGameSchema.parse(body)

    const trimmedName =
      name.trim()

    const slug =
      slugify(trimmedName)

    const {
      data: createdGame,
      error: createError,
    } = await supabase
      .from('games')
      .insert({
        name: trimmedName,
        slug,
      })
      .select(`
        id,
        name,
        slug
      `)
      .single()

    if (
      createError ||
      !createdGame
    ) {
      console.error(
        'Create game error:',
        createError
      )

      const isDuplicate =
        createError?.code ===
        '23505'

      return NextResponse.json(
        {
          error: isDuplicate
            ? 'Game already exists'
            : createError?.message ??
              'Unable to create game',
        },
        {
          status: isDuplicate
            ? 409
            : 500,
        }
      )
    }

    return NextResponse.json(
      {
        success: true,

        game: {
          id: String(
            createdGame.id
          ),

          name:
            createdGame.name,

          slug:
            createdGame.slug ??
            slug,

          categories_count: 0,

          assigned_sellers_count: 0,

          assigned_sellers: [],
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (
      error instanceof
      z.ZodError
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
      'Create game error:',
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
