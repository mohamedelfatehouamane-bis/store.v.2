import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as supabase, supabaseAdmin } from '@/lib/db'
import { verifyToken, resolveUserId } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authHeader = request.headers.get('authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = supabaseAdmin ?? supabase

    // Resolve the correct public.users.id from the DB so authorization
    // checks work even when the JWT carries a stale Supabase Auth UID.
    const resolvedUserId = await resolveUserId(auth, db)

    const { data: order, error: orderError } = await db
      .from('orders')
      .select('customer_id, assigned_seller_id')
      .eq('id', id)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const isAuthorized =
      order.customer_id === resolvedUserId ||
      order.assigned_seller_id === resolvedUserId ||
      auth.role === 'admin'

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { data: events, error: eventsError } = await db
      .from('order_events')
      .select('id, type, message, created_by, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: true })

    if (eventsError) {
      console.error('Fetch order events error:', eventsError)
      return NextResponse.json({ success: true, events: [] })
    }

    return NextResponse.json({ success: true, events: events ?? [] })
  } catch (error) {
    console.error('Order events route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
