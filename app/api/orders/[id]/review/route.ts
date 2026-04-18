import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase, supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
})

const db: any = supabaseAdmin ?? supabase

function isMissingColumnError(error: any) {
  const message = String(error?.message ?? '')
  return error?.code === '42703' || message.includes('column')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params

    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)
    if (!auth || auth.role !== 'customer') {
      return NextResponse.json({ error: 'Only customers can write reviews' }, { status: 403 })
    }

    const payload = reviewSchema.parse(await request.json())

    const { data: order, error: orderError } = await db
      .from('orders')
      .select('id, status, customer_id, assigned_seller_id')
      .eq('id', orderId)
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

    if (order.assigned_seller_id === auth.id) {
      return NextResponse.json({ error: 'Sellers cannot review themselves' }, { status: 403 })
    }

    const { data: existingReview, error: existingError } = await db
      .from('reviews')
      .select('id, rating, comment, created_at')
      .eq('order_id', orderId)
      .maybeSingle()

    if (existingError) {
      if ((existingError as any).code === 'PGRST205') {
        return NextResponse.json({ error: 'Review storage is not configured yet' }, { status: 501 })
      }
      return NextResponse.json({ error: 'Unable to validate existing review' }, { status: 500 })
    }

    if (existingReview) {
      return NextResponse.json({ success: true, already_exists: true, review: existingReview })
    }

    const reviewInsertBase = {
      order_id: orderId,
      seller_id: order.assigned_seller_id,
      customer_id: auth.id,
      rating: payload.rating,
      comment: payload.comment?.trim() || null,
    }

    let insertedReview: any = null
    let insertError: any = null

    const insertWithReviewer = await db
      .from('reviews')
      .insert({ ...reviewInsertBase, reviewer_id: auth.id })
      .select('*')
      .single()

    insertedReview = insertWithReviewer.data
    insertError = insertWithReviewer.error

    if (insertError && isMissingColumnError(insertError)) {
      const insertFallback = await db
        .from('reviews')
        .insert(reviewInsertBase)
        .select('*')
        .single()
      insertedReview = insertFallback.data
      insertError = insertFallback.error
    }

    if (insertError || !insertedReview) {
      if ((insertError as any)?.code === '23505') {
        const { data: raceExisting } = await db
          .from('reviews')
          .select('*')
          .eq('order_id', orderId)
          .maybeSingle()

        return NextResponse.json({ success: true, already_exists: true, review: raceExisting })
      }

      return NextResponse.json({ error: 'Unable to save review' }, { status: 500 })
    }

    // Update users reputation stats when supported by schema.
    const { data: sellerUser, error: sellerUserError } = await db
      .from('users')
      .select('id, rating, total_reviews')
      .eq('id', order.assigned_seller_id)
      .maybeSingle()

    if (!sellerUserError && sellerUser) {
      const previousRating = Number(sellerUser.rating ?? 5)
      const previousTotal = Number(sellerUser.total_reviews ?? 0)
      const nextTotal = previousTotal + 1
      const nextRating = Number((((previousRating * previousTotal) + payload.rating) / nextTotal).toFixed(2))

      const { error: userStatsUpdateError } = await db
        .from('users')
        .update({
          rating: nextRating,
          total_reviews: nextTotal,
        })
        .eq('id', order.assigned_seller_id)

      if (userStatsUpdateError && !isMissingColumnError(userStatsUpdateError)) {
        console.error('User seller reputation update error:', userStatsUpdateError)
      }
    }

    // Keep legacy sellers stats in sync for existing pages/queries.
    const { data: sellerReviews, error: sellerReviewsError } = await db
      .from('reviews')
      .select('rating')
      .eq('seller_id', order.assigned_seller_id)

    if (!sellerReviewsError && Array.isArray(sellerReviews)) {
      const ratings = sellerReviews.map((r: any) => Number(r.rating)).filter((value: number) => Number.isFinite(value))
      const totalReviews = ratings.length
      const averageRating = totalReviews > 0
        ? Number((ratings.reduce((sum: number, value: number) => sum + value, 0) / totalReviews).toFixed(2))
        : 0

      const { error: sellersUpdateError } = await db
        .from('sellers')
        .update({ average_rating: averageRating, total_reviews: totalReviews })
        .eq('user_id', order.assigned_seller_id)

      if (sellersUpdateError && !isMissingColumnError(sellersUpdateError)) {
        console.error('Legacy sellers rating update error:', sellersUpdateError)
      }
    }

    return NextResponse.json({ success: true, review: insertedReview })
  } catch (error) {
    console.error('Create order review error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
