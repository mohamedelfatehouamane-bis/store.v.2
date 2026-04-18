import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { buildTrustSummary } from '@/lib/trust-score'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const authHeader = request.headers.get('authorization')
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
      .eq('id', id)
      .eq('is_active', true)
      .eq('type', 'exclusive')

    if (!auth || auth.role === 'customer') {
      query = query.or('status.eq.approved,status.is.null')
    } else if (auth.role === 'seller') {
      query = query.or(`seller_id.eq.${auth.id},status.eq.approved,status.is.null`)
    }

    const { data: offer, error } = await query.single()

    if (error || !offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    let sellerStats: any = null
    if (offer.seller?.id) {
      const { data: sellerWithReputation, error: sellerWithReputationError } = await supabase
        .from('users')
        .select('id, rating, total_reviews, completed_orders, dispute_count')
        .eq('id', offer.seller.id)
        .maybeSingle()

      if (sellerWithReputationError && sellerWithReputationError.code === '42703') {
        const { data: sellerLegacy, error: sellerLegacyError } = await supabase
          .from('users')
          .select('id')
          .eq('id', offer.seller.id)
          .maybeSingle()

        if (sellerLegacyError) {
          console.error('Get exclusive offer seller fallback error:', sellerLegacyError)
          return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
        }

        sellerStats = sellerLegacy
      } else if (sellerWithReputationError) {
        console.error('Get exclusive offer seller stats error:', sellerWithReputationError)
        return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
      } else {
        sellerStats = sellerWithReputation
      }
    }

    const rating = Number(sellerStats?.rating ?? 0)
    const totalReviews = Number(sellerStats?.total_reviews ?? 0)
    const completedOrders = Number(sellerStats?.completed_orders ?? 0)
    const disputeCount = Number(sellerStats?.dispute_count ?? 0)
    const trust = buildTrustSummary({
      rating,
      completed_orders: completedOrders,
      dispute_count: disputeCount,
    })

    return NextResponse.json({
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
      game: offer.game ? {
        id: offer.game.id,
        name: offer.game.name,
      } : null,
    })
  } catch (error) {
    console.error('Get exclusive offer error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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
        { error: 'Only sellers can edit exclusive offers' },
        { status: 403 }
      )
    }

    const { data: offer, error: offerError } = await supabaseAdmin
      .from('products')
      .select('seller_id, status')
      .eq('id', id)
      .eq('type', 'exclusive')
      .single()

    if (offerError || !offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    if (offer.seller_id !== auth.id) {
      return NextResponse.json(
        { error: 'You can only edit your own offers' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const updates: any = {}

    if ('name' in body) updates.name = body.name
    if ('description' in body) updates.description = body.description
    if ('price' in body) {
      if (typeof body.price !== 'number' || body.price <= 0) {
        return NextResponse.json(
          { error: 'Price must be a positive number' },
          { status: 400 }
        )
      }
      updates.points_price = body.price
    }
    if ('game_id' in body) updates.game_id = body.game_id

    if (Object.keys(updates).length > 0 && (offer.status === 'approved' || offer.status === 'rejected')) {
      updates.status = 'pending'
      updates.approved_by = null
      updates.approved_at = null
    }

    updates.updated_at = new Date().toISOString()

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('products')
      .update(updates)
      .eq('id', id)
      .eq('type', 'exclusive')
      .select()
      .single()

    if (updateError) {
      console.error('Update exclusive offer error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update offer' },
        { status: 500 }
      )
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Update exclusive offer API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Admin client not configured' },
        { status: 500 }
      )
    }

    const authHeader = _request.headers.get('authorization')

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
        { error: 'Only sellers can delete exclusive offers' },
        { status: 403 }
      )
    }

    const { data: offer, error: offerError } = await supabaseAdmin
      .from('products')
      .select('seller_id')
      .eq('id', id)
      .eq('type', 'exclusive')
      .single()

    if (offerError || !offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    if (offer.seller_id !== auth.id) {
      return NextResponse.json(
        { error: 'You can only delete your own offers' },
        { status: 403 }
      )
    }

    const { error: deleteError } = await supabaseAdmin
      .from('products')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('type', 'exclusive')

    if (deleteError) {
      console.error('Delete exclusive offer error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete offer' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete exclusive offer API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
