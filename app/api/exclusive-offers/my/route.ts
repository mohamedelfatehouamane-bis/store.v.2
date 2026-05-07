import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth || auth.role !== 'seller') {
      return NextResponse.json({ error: 'Only sellers can access their packs' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('products')
      .select('id, name, description, points_price, created_at, status, is_active, game_id')
      .eq('seller_id', auth.id)
      .eq('is_active', true)
      .eq('type', 'exclusive')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('My exclusive packs fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch your packs' }, { status: 500 })
    }

    const gameIds = Array.from(
      new Set((data ?? []).map((pack: any) => String(pack.game_id ?? '')).filter(Boolean))
    )

    let gamesById = new Map<string, any>()
    if (gameIds.length > 0) {
      const { data: games, error: gamesError } = await supabase
        .from('games')
        .select('id, name')
        .in('id', gameIds)

      if (gamesError) {
        console.error('My exclusive packs game lookup error:', gamesError)
        return NextResponse.json({ error: 'Failed to fetch your packs' }, { status: 500 })
      }
      gamesById = new Map((games ?? []).map((game: any) => [String(game.id), game]))
    }

    const packs = (data ?? []).map((pack: any) => ({
      id: pack.id,
      name: pack.name,
      description: pack.description,
      price: pack.points_price,
      created_at: pack.created_at,
      status: pack.status ?? 'approved',
      game: pack.game_id
        ? {
            id: pack.game_id,
            name: gamesById.get(String(pack.game_id))?.name ?? null,
          }
        : null,
    }))

    return NextResponse.json({
      packs,
      total: packs.length,
    })
  } catch (error) {
    console.error('My exclusive packs API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
