import { NextRequest, NextResponse } from 'next/server'

import {
  supabaseServer as supabase,
} from '@/lib/db'

export async function GET(
  _request: NextRequest
) {
  try {
    // =====================================================
    // LOAD ACTIVE GAMES
    // =====================================================

    const {
      data: gamesData,
      error: gamesError,
    } = await supabase
      .from('games')
      .select(`
        id,
        name,
        description,
        image_url,
        slug,
        is_active
      `)
      .eq('is_active', true)
      .order('name', {
        ascending: true,
      })

    if (gamesError) {
      console.error(
        'Games API error:',
        gamesError
      )

      return NextResponse.json(
        {
          success: false,
          games: [],
          error:
            gamesError.message,
        },
        { status: 500 }
      )
    }

    const games =
      gamesData ?? []

    // =====================================================
    // LOAD CATEGORIES
    // =====================================================

    const gameIds = games.map(
      (game: any) => game.id
    )

    let categoriesByGame =
      new Map<string, any[]>()

    if (gameIds.length > 0) {
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
        .in('game_id', gameIds)
        .order('name', {
          ascending: true,
        })

      if (categoriesError) {
        console.error(
          'Categories load error:',
          categoriesError
        )
      } else {
        for (const category of categories ??
          []) {
          const gameId = String(
            category.game_id
          )

          const current =
            categoriesByGame.get(
              gameId
            ) ?? []

          current.push({
            id: category.id,
            name: category.name,
          })

          categoriesByGame.set(
            gameId,
            current
          )
        }
      }
    }

    // =====================================================
    // NORMALIZE RESPONSE
    // =====================================================

    const normalizedGames =
      games.map((game: any) => ({
        id: game.id,

        name: game.name,

        description:
          game.description,

        image_url:
          game.image_url,

        slug:
          game.slug,

        categories:
          categoriesByGame.get(
            String(game.id)
          ) ?? [],
      }))

    return NextResponse.json({
      success: true,

      games:
        normalizedGames,
    })
  } catch (error) {
    console.error(
      'Games API unexpected error:',
      error
    )

    return NextResponse.json(
      {
        success: false,
        games: [],
        error:
          'Internal server error',
      },
      { status: 500 }
    )
  }
}
