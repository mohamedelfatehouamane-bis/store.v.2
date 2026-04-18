import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
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

async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const token = authHeader.substring(7)
  const auth = verifyToken(token)

  if (!auth || auth.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Only admins can access games' }, { status: 403 }) }
  }

  return { auth }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request)
    if ('error' in authResult) {
      return authResult.error
    }

    const [{ data: games, error: gamesError }, { data: assignments, error: assignmentsError }, { data: sellers, error: sellersError }, { data: sellerProfiles, error: sellerProfilesError }] =
      await Promise.all([
        supabase.from('games').select('id, name, slug').order('created_at', { ascending: false }),
        supabase.from('seller_games').select('game_id, seller_id'),
        supabase.from('users').select('id, username, email').eq('role', 'seller'),
        supabase.from('sellers').select('id, user_id'),
      ])

    if (gamesError || assignmentsError || sellersError || sellerProfilesError) {
      const error = gamesError ?? assignmentsError ?? sellersError ?? sellerProfilesError
      console.error('Get admin games error:', error)
      return NextResponse.json({ error: error?.message ?? 'Unable to load games' }, { status: 500 })
    }

    const sellersById = new Map((sellers ?? []).map((seller: any) => [String(seller.id), seller]))
    const sellerProfileBySellerId = new Map((sellerProfiles ?? []).map((profile: any) => [String(profile.id), String(profile.user_id)]))
    const assignmentsByGame = new Map<string, any[]>()

    for (const assignment of assignments ?? []) {
      const gameId = String((assignment as any).game_id)
      const userId = sellerProfileBySellerId.get(String((assignment as any).seller_id))
      const seller = userId ? sellersById.get(userId) : undefined
      if (!seller) {
        continue
      }

      const current = assignmentsByGame.get(gameId) ?? []
      current.push({
        id: String(seller.id),
        username: seller.username,
        email: seller.email,
      })
      assignmentsByGame.set(gameId, current)
    }

    const normalizedGames = (games ?? []).map((game: any) => {
      const assignedSellers = assignmentsByGame.get(String(game.id)) ?? []
      return {
        id: String(game.id),
        name: game.name,
        slug: game.slug ?? slugify(game.name),
        assigned_sellers_count: assignedSellers.length,
        assigned_sellers: assignedSellers,
      }
    })

    return NextResponse.json({
      success: true,
      games: normalizedGames,
    })
  } catch (error) {
    console.error('Get admin games error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request)
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const { name } = createGameSchema.parse(body)
    const trimmedName = name.trim()
    const slug = slugify(trimmedName)

    const { data: createdGame, error: createError } = await supabase
      .from('games')
      .insert({ name: trimmedName, slug })
      .select('id, name, slug')
      .single()

    if (createError || !createdGame) {
      console.error('Create game error:', createError)
      const isDuplicate = createError?.code === '23505'
      return NextResponse.json(
        { error: isDuplicate ? 'Game already exists' : createError?.message ?? 'Unable to create game' },
        { status: isDuplicate ? 409 : 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        game: {
          id: String(createdGame.id),
          name: createdGame.name,
          slug: createdGame.slug ?? slug,
          assigned_sellers_count: 0,
          assigned_sellers: [],
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 })
    }

    console.error('Create game error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
