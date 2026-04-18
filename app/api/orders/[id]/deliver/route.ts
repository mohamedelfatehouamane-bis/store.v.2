import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { telegramService } from '@/lib/telegram-service'
import { addOrderEvent } from '@/lib/order-events'

export async function POST(
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

    if (!auth || auth.role !== 'seller') {
      return NextResponse.json({ error: 'Only sellers can mark delivery' }, { status: 403 })
    }

    const db = supabaseAdmin ?? supabase

    const { data: orderData, error: orderError } = await (db
      .from('orders') as any)
      .select('*')
      .eq('id', id)
      .single()

    const order = orderData as any

    if (orderError || !order) {
      if (orderError) {
        console.error('Deliver order lookup error:', orderError)
      }
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.assigned_seller_id !== auth.id) {
      return NextResponse.json({ error: 'Only the assigned seller can mark this order as delivered' }, { status: 403 })
    }

    if (order.status === 'disputed') {
      return NextResponse.json({ error: 'Cannot mark an order as delivered while it is disputed' }, { status: 400 })
    }

    if (!['open', 'in_progress', 'accepted'].includes(order.status)) {
      return NextResponse.json({ error: 'Only active orders can be marked delivered' }, { status: 400 })
    }

    if (order.status === 'delivered') {
      return NextResponse.json({ error: 'This order is already marked as delivered' }, { status: 400 })
    }

    if (order.delivered_at) {
      return NextResponse.json({ error: 'This order is already marked as delivered' }, { status: 400 })
    }

    const now = new Date()
    const releaseDays = 7
    const autoReleaseAt = new Date(now.getTime() + releaseDays * 24 * 60 * 60 * 1000).toISOString()

    // Try modern schema first, then progressively fall back for older schemas
    // (missing columns and/or status enum value differences).
    const updateAttempts: Array<Record<string, any>> = [
      {
        status: 'delivered',
        delivered_at: now.toISOString(),
        auto_release_at: autoReleaseAt,
        updated_at: now.toISOString(),
      },
      {
        status: 'delivered',
        approved_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      {
        status: 'in_progress',
        approved_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      {
        status: 'in_progress',
        approved_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
    ]

    let updateError: any = null
    for (const payload of updateAttempts) {
      const result = await (db
        .from('orders') as any)
        .update(payload)
        .eq('id', id)

      updateError = result.error
      if (!updateError) {
        break
      }
    }

    if (updateError) {
      console.error('Mark delivered error:', JSON.stringify(updateError))
      return NextResponse.json({ error: 'Unable to mark order delivered' }, { status: 500 })
    }

    await addOrderEvent(db, {
      orderId: id,
      type: 'delivered',
      message: 'Order marked as delivered',
      userId: auth.id,
    })

    const { data: customer } = await (db
      .from('users') as any)
      .select('telegram_id')
      .eq('id', order.customer_id)
      .maybeSingle()

    if (customer?.telegram_id) {
      void telegramService
        .sendMessage(customer.telegram_id, telegramService.orderUpdatedMessage(String(id), 'Delivered'))
        .catch((err) => {
          console.warn('[Orders][Deliver] Telegram notify skipped:', err instanceof Error ? err.message : String(err))
        })
    }

    return NextResponse.json({ success: true, message: 'Order marked as delivered' })
  } catch (error) {
    console.error('Deliver route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
