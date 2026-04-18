import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can view pending exclusive packs' }, { status: 403 })
    }

    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, description, points_price, created_at, status, seller_id, game_id')
      .eq('is_active', true)
      .eq('type', 'exclusive')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Pending exclusive packs fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch pending packs' }, { status: 500 })
    }

    const sellerIds = Array.from(
      new Set(
        (products ?? [])
          .map((product: any) => product.seller_id)
          .filter((id: string | null | undefined) => Boolean(id))
      )
    )
    const gameIds = Array.from(
      new Set(
        (products ?? [])
          .map((product: any) => product.game_id)
          .filter((id: string | null | undefined) => Boolean(id))
      )
    )

    const [sellerResult, gameResult] = await Promise.all([
      sellerIds.length > 0
        ? supabase.from('users').select('id, username').in('id', sellerIds)
        : Promise.resolve({ data: [], error: null }),
      gameIds.length > 0
        ? supabase.from('games').select('id, name').in('id', gameIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    const sellersById: Record<string, { id: string; username: string }> = {}
    const gamesById: Record<string, { id: string; name: string }> = {}

    if (!sellerResult.error) {
      (sellerResult.data ?? []).forEach((user: any) => {
        sellersById[user.id] = { id: user.id, username: user.username }
      })
    }

    if (!gameResult.error) {
      (gameResult.data ?? []).forEach((game: any) => {
        gamesById[game.id] = { id: game.id, name: game.name }
      })
    }

    const packs = (products ?? []).map((product: any) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.points_price,
      created_at: product.created_at,
      status: product.status ?? 'pending',
      seller: sellersById[product.seller_id] ?? { id: product.seller_id, username: 'Unknown' },
      game: gamesById[product.game_id] ?? null,
    }))

    return NextResponse.json({
      packs,
      total: packs.length,
    })
  } catch (error) {
    console.error('Pending exclusive packs API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
