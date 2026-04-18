import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { buildTrustSummary } from '@/lib/trust-score'

export async function GET(_request: NextRequest) {
  try {
    const authHeader = _request.headers.get('authorization')
    const auth = authHeader?.startsWith('Bearer ')
      ? verifyToken(authHeader.substring(7))
      : null

    let query = supabase
      .from('products')
      .select(
        `
        id,
        name,
        description,
        points_price,
        created_at,
        seller_id,
        game_id,
        status,
        approved_at,
        game:game_id(id, name),
        seller:seller_id(id, username, avatar_url)
        `
      )
      .eq('is_active', true)
      .eq('type', 'exclusive')
      .order('created_at', { ascending: false })

    if (!auth || auth.role === 'customer') {
      query = query.or('status.eq.approved,status.is.null')
    } else if (auth.role === 'seller') {
      query = query.or(`seller_id.eq.${auth.id},status.eq.approved,status.is.null`)
    }

    const { data: offers, error } = await query

    if (error) {
      console.error('Exclusive offers fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 })
    }

    const sellerIds = Array.from(
      new Set((offers ?? []).map((offer: any) => String(offer.seller?.id ?? '')).filter(Boolean))
    )

    let sellerStatsById = new Map<string, any>()

    if (sellerIds.length > 0) {
      const { data: sellerUsers, error: sellerUsersError } = await supabase
        .from('users')
        .select('id, rating, total_reviews, completed_orders, dispute_count')
        .in('id', sellerIds)

      if (sellerUsersError && sellerUsersError.code === '42703') {
        const { data: sellerUsersLegacy, error: sellerUsersLegacyError } = await supabase
          .from('users')
          .select('id')
          .in('id', sellerIds)

        if (sellerUsersLegacyError) {
          console.error('Exclusive offers seller fallback stats error:', sellerUsersLegacyError)
          return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 })
        }

        sellerStatsById = new Map((sellerUsersLegacy ?? []).map((row: any) => [String(row.id), row]))
      } else if (sellerUsersError) {
        console.error('Exclusive offers seller stats error:', sellerUsersError)
        return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 })
      } else {
        sellerStatsById = new Map((sellerUsers ?? []).map((row: any) => [String(row.id), row]))
      }
    }

    const enrichedOffers = (offers ?? []).map((offer: any) => {
      const sellerStats = sellerStatsById.get(String(offer.seller?.id ?? ''))
      const rating = Number(sellerStats?.rating ?? 0)
      const totalReviews = Number(sellerStats?.total_reviews ?? 0)
      const completedOrders = Number(sellerStats?.completed_orders ?? 0)
      const disputeCount = Number(sellerStats?.dispute_count ?? 0)
      const trust = buildTrustSummary({
        rating,
        completed_orders: completedOrders,
        dispute_count: disputeCount,
      })

      return {
        id: offer.id,
        name: offer.name,
        description: offer.description,
        price: offer.points_price,
        created_at: offer.created_at,
        status: offer.status ?? 'approved',
        approved_at: offer.approved_at,
        seller: {
          id: offer.seller?.id,
          username: offer.seller?.username,
          avatar_url: offer.seller?.avatar_url,
          rating,
          total_reviews: totalReviews,
          completed_orders: completedOrders,
          dispute_count: disputeCount,
          ...trust,
        },
        game: offer.game
          ? {
              id: offer.game.id,
              name: offer.game.name,
            }
          : null,
      }
    })

    return NextResponse.json({
      offers: enrichedOffers,
      total: enrichedOffers.length,
    })
  } catch (error) {
    console.error('Exclusive offers API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Admin client not configured' },
        { status: 500 }
      )
    }

    const authHeader = request.headers.get('authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    if (auth.role !== 'seller') {
      return NextResponse.json(
        { error: 'Only sellers can create exclusive offers' },
        { status: 403 }
      )
    }

    // Verify user is a seller
    const { data: seller, error: sellerError } = await supabaseAdmin
      .from('sellers')
      .select('id')
      .eq('user_id', auth.id)
      .single()

    if (sellerError || !seller) {
      return NextResponse.json(
        { error: 'Only sellers can create exclusive offers' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, description, price, game_id } = body

    // Validate required fields
    if (!name || !price) {
      return NextResponse.json(
        { error: 'Name and price are required' },
        { status: 400 }
      )
    }

    if (typeof price !== 'number' || price <= 0) {
      return NextResponse.json(
        { error: 'Price must be a positive number' },
        { status: 400 }
      )
    }

    const { data: newOffer, error: createError } = await supabaseAdmin
      .from('products')
      .insert({
        seller_id: auth.id,
        name,
        description: description || null,
        points_price: price,
        game_id: game_id || null,
        is_active: true,
        status: 'pending',
        type: 'exclusive',
        approved_by: null,
        approved_at: null,
      })
      .select()
      .single()

    if (createError) {
      console.error('Create exclusive offer error:', createError)
      return NextResponse.json(
        { error: 'Failed to create offer' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ...newOffer,
      price: newOffer?.points_price,
      message: 'Exclusive pack submitted for admin approval',
    }, { status: 201 })
  } catch (error) {
    console.error('Create exclusive offer API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
