import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { telegramService } from '@/lib/telegram-service'
import { addOrderEvent } from '@/lib/order-events'

const disputeSchema = z.object({
  reason: z.string().min(10).max(1000),
})

function buildDisputeTelegramMessage(orderId: string, username: string | null, reason: string) {
  const preview = reason.length > 250 ? `${reason.slice(0, 247)}...` : reason
  return [
    '🚨 New dispute reported',
    `Order ID: #${orderId}`,
    `Reported by: ${username ?? 'Unknown user'}`,
    `Reason: ${preview}`,
  ].join('\n')
}

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

    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { reason } = disputeSchema.parse(body)

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, customer_id, assigned_seller_id, status')
      .eq('id', id)
      .single()

    if (orderError || !order) {
      console.error('Dispute lookup error:', orderError)
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const isCustomer = auth.role === 'customer' && auth.id === order.customer_id
    const isSeller = auth.role === 'seller' && auth.id === order.assigned_seller_id

    if (!isCustomer && !isSeller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (['cancelled', 'disputed'].includes(order.status)) {
      return NextResponse.json({ error: 'This order cannot be disputed' }, { status: 400 })
    }

    const previousStatus = order.status

    const { error: disputeError } = await supabaseAdmin
      .from('disputes')
      .insert({
        order_id: id,
        opened_by: auth.id,
        reason,
        status: 'open',
        previous_status: previousStatus,
      })

    if (disputeError) {
      console.error('Create dispute error:', disputeError)
      return NextResponse.json({ error: 'Unable to create dispute' }, { status: 500 })
    }

    const { error: updateOrderError } = await supabaseAdmin
      .from('orders')
      .update({ status: 'disputed', updated_at: new Date().toISOString() })
      .eq('id', id)

    if (updateOrderError) {
      console.error('Order dispute update error:', updateOrderError)
      return NextResponse.json({ error: 'Unable to flag order as disputed' }, { status: 500 })
    }

    if (order.assigned_seller_id) {
      const { data: sellerStats, error: sellerStatsError } = await supabaseAdmin
        .from('users')
        .select('id, dispute_count')
        .eq('id', order.assigned_seller_id)
        .maybeSingle()

      if (!sellerStatsError && sellerStats) {
        const currentDisputeCount = Number((sellerStats as any).dispute_count ?? 0)
        const { error: sellerDisputeUpdateError } = await supabaseAdmin
          .from('users')
          .update({ dispute_count: currentDisputeCount + 1 })
          .eq('id', order.assigned_seller_id)

        if (sellerDisputeUpdateError && sellerDisputeUpdateError.code !== '42703' && sellerDisputeUpdateError.code !== 'PGRST204') {
          console.error('Seller dispute_count update error:', sellerDisputeUpdateError)
        }
      }
    }

    await addOrderEvent(supabaseAdmin, {
      orderId: id,
      type: 'dispute_reported',
      message: `⚠️ Dispute opened by ${auth.role}: ${reason}`,
      userId: auth.id,
    })

    const userIds = [order.customer_id, order.assigned_seller_id].filter(Boolean)
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id, telegram_id')
      .in('id', userIds)

    if (!usersError && Array.isArray(users)) {
      for (const user of users) {
        if (!user?.telegram_id) continue
        void telegramService.sendMessage(user.telegram_id, buildDisputeTelegramMessage(id, auth.username ?? null, reason)).catch((err) => {
          console.warn('[Orders][Dispute] Telegram notify skipped:', err instanceof Error ? err.message : String(err))
        })
      }
    }

    const adminChatId = process.env.ADMIN_TELEGRAM_CHAT_ID || process.env.DISPUTE_TELEGRAM_CHAT_ID
    if (adminChatId) {
      void telegramService.sendMessage(adminChatId, buildDisputeTelegramMessage(id, auth.username ?? null, reason)).catch((err) => {
        console.warn('[Orders][Dispute] Admin Telegram notify skipped:', err instanceof Error ? err.message : String(err))
      })
    }

    return NextResponse.json({ success: true, message: 'Dispute reported successfully' })
  } catch (error) {
    console.error('Create dispute route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
