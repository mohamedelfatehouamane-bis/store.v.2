import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { z } from 'zod'

const createReviewSchema = z.object({
  order_id: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const db = supabaseAdmin ?? supabase
    const { searchParams } = new URL(request.url)
    const sellerId = searchParams.get('seller_id')
    const orderId = searchParams.get('order_id')

    if (!sellerId && !orderId) {
      return NextResponse.json(
        { error: 'seller_id or order_id is required' },
        { status: 400 }
      )
    }

    let query = db
      .from('reviews')
      .select(
        'id, rating, comment, created_at, customer:customer_id(username, avatar_url), seller_id, order_id'
      )

    if (sellerId) {
      query = query.eq('seller_id', sellerId).order('created_at', { ascending: false })
    }

    if (orderId) {
      query = query.eq('order_id', orderId).limit(1)
    }

    const { data, error } = await query

    if (error) {
      // Backward-compatible fallback: deployments may not have a reviews table.
      if ((error as any).code === 'PGRST205') {
        if (sellerId) {
          const { data: seller, error: sellerError } = await db
            .from('sellers')
            .select('average_rating, total_reviews')
            .eq('user_id', sellerId)
            .maybeSingle()

          if (sellerError) {
            console.error('Fetch seller rating fallback error:', sellerError)
            return NextResponse.json({ error: 'Unable to fetch reviews' }, { status: 500 })
          }

          return NextResponse.json({
            success: true,
            reviews: [],
            avg_rating: Number((seller as any)?.average_rating ?? 0),
            total_reviews: Number((seller as any)?.total_reviews ?? 0),
          })
        }

        return NextResponse.json({ success: true, reviews: [] })
      }

      console.error('Fetch reviews error:', error)
      return NextResponse.json({ error: 'Unable to fetch reviews' }, { status: 500 })
    }

    const reviews = data ?? []

    let avgRating = 0
    let totalReviews = 0

    if (sellerId && reviews.length > 0) {
      const ratings = reviews.map((r: any) => Number(r.rating))
      totalReviews = reviews.length
      avgRating = Math.round((ratings.reduce((sum, r) => sum + r, 0) / totalReviews) * 10) / 10
    }

    return NextResponse.json({
      success: true,
      reviews,
      ...(sellerId && { avg_rating: avgRating, total_reviews: totalReviews }),
    })
  } catch (error) {
    console.error('Get reviews error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


export async function POST(request: NextRequest) {
  try {
    const db = supabaseAdmin ?? supabase
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)
    if (!auth || auth.role !== 'customer') {
      return NextResponse.json({ error: 'Only customers can write reviews' }, { status: 403 })
    }

    const body = await request.json()
    const payload = createReviewSchema.parse(body)

    const { data: order, error: orderError } = await db
      .from('orders')
      .select('id, status, customer_id, assigned_seller_id')
      .eq('id', payload.order_id)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.customer_id !== auth.id) {
      return NextResponse.json({ error: 'Only the purchasing customer can review this order' }, { status: 403 })
    }

    if (order.status !== 'completed') {
      return NextResponse.json({ error: 'Reviews can only be submitted for completed orders' }, { status: 400 })
    }

    if (!order.assigned_seller_id) {
      return NextResponse.json({ error: 'Order has no assigned seller' }, { status: 400 })
    }

    const { data: existingReview, error: existingError } = await db
      .from('reviews')
      .select('id')
      .eq('order_id', payload.order_id)
      .maybeSingle()

    if (existingError) {
      if ((existingError as any).code === 'PGRST205') {
        return NextResponse.json(
          { error: 'Review storage is not configured yet' },
          { status: 501 }
        )
      }
      console.error('Existing review lookup error:', existingError)
      return NextResponse.json({ error: 'Unable to validate existing review' }, { status: 500 })
    }

    if (existingReview) {
      const { data: existingFullReview, error: existingFullReviewError } = await db
        .from('reviews')
        .select('*')
        .eq('id', existingReview.id)
        .maybeSingle()

      if (existingFullReviewError) {
        console.error('Existing review fetch error:', existingFullReviewError)
      }

      return NextResponse.json({
        success: true,
        review: existingFullReview ?? existingReview,
        already_exists: true,
      })
    }

    const reviewData = {
      order_id: payload.order_id,
      seller_id: order.assigned_seller_id,
      customer_id: auth.id,
      rating: payload.rating,
      comment: payload.comment?.trim() || null,
    }

    const { data: insertedReview, error: insertError } = await db
      .from('reviews')
      .insert(reviewData)
      .select('*')
      .single()

    if (insertError || !insertedReview) {
      if ((insertError as any)?.code === '23505') {
        const { data: raceExistingReview, error: raceExistingReviewError } = await db
          .from('reviews')
          .select('*')
          .eq('order_id', payload.order_id)
          .maybeSingle()

        if (raceExistingReviewError) {
          console.error('Race existing review fetch error:', raceExistingReviewError)
          return NextResponse.json({ error: 'Unable to save review' }, { status: 500 })
        }

        return NextResponse.json({
          success: true,
          review: raceExistingReview,
          already_exists: true,
        })
      }

      if ((insertError as any)?.code === 'PGRST205') {
        return NextResponse.json(
          { error: 'Review storage is not configured yet' },
          { status: 501 }
        )
      }
      console.error('Insert review error:', insertError)
      return NextResponse.json({ error: 'Unable to save review' }, { status: 500 })
    }

    const { data: reviewStats, error: statsError } = await db
      .from('reviews')
      .select('rating', { count: 'exact' })
      .eq('seller_id', order.assigned_seller_id)

    if (statsError || !reviewStats) {
      console.error('Review stats lookup error:', statsError)
    } else {
      const ratings = (reviewStats as any[]).map((item) => Number(item.rating))
      const totalReviews = reviewStats.length
      const averageRating = totalReviews > 0
        ? Number((ratings.reduce((sum, value) => sum + value, 0) / totalReviews).toFixed(2))
        : 0

      const { error: sellerUpdateError } = await db
        .from('sellers')
        .update({ average_rating: averageRating, total_reviews: totalReviews })
        .eq('user_id', order.assigned_seller_id)

      if (sellerUpdateError) {
        console.error('Seller rating update error:', sellerUpdateError)
      }
    }

    return NextResponse.json({ success: true, review: insertedReview })
  } catch (error) {
    console.error('Create review error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
