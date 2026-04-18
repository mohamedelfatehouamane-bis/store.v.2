import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { telegramService } from '@/lib/telegram-service'
import { addOrderEvent } from '@/lib/order-events'

async function releaseOrderFunds(order: any) {
  const db = supabaseAdmin ?? supabase

  if (!order.assigned_seller_id) {
    return { success: false, error: 'Order has no assigned seller' }
  }

  const paymentAmount = Number(order.points_amount ?? 0)
  const payoutAmount = paymentAmount

  if (payoutAmount <= 0) {
    return { success: false, error: 'No seller payout is configured for this order' }
  }

  const { data: sellerUserData, error: sellerUserError } = await (db
    .from('users') as any)
    .select('id, points, telegram_id')
    .eq('id', order.assigned_seller_id)
    .single()

  const sellerUser = sellerUserData as any

  if (sellerUserError || !sellerUser) {
    return { success: false, error: 'Seller user not found' }
  }

  const previousTotalPoints = Number(sellerUser.points ?? 0)
  const newTotalPoints = previousTotalPoints + payoutAmount

  const { error: userUpdateError } = await (db
    .from('users') as any)
    .update({ points: newTotalPoints })
    .eq('id', sellerUser.id)

  if (userUpdateError) {
    console.error('Seller balance update error:', userUpdateError)
    return { success: false, error: 'Unable to credit seller account' }
  }

  if (sellerUser.telegram_id) {
    void telegramService
      .sendMessage(
        sellerUser.telegram_id,
        telegramService.pointsTransactionMessage(payoutAmount, newTotalPoints)
      )
      .catch((err) => {
        console.warn('[Orders][Confirm] Seller payout notify skipped:', err instanceof Error ? err.message : String(err))
      })
  }

  const txAttempts: Array<Record<string, any>> = [
    {
      user_id: sellerUser.id,
      amount: payoutAmount,
      transaction_type: 'order',
      status: 'completed',
      reference_id: order.id,
      related_order_id: order.id,
      description: 'Order confirmation payout',
      balance_before: previousTotalPoints,
      balance_after: newTotalPoints,
    },
    {
      user_id: sellerUser.id,
      amount: payoutAmount,
      type: 'order',
      status: 'completed',
      reference_id: order.id,
    },
    {
      user_id: sellerUser.id,
      amount: payoutAmount,
      status: 'completed',
      reference_id: order.id,
    },
  ]

  let txError: any = null
  for (const payload of txAttempts) {
    const result = await (db
      .from('point_transactions') as any)
      .insert(payload)
    txError = result.error
    if (!txError) {
      break
    }
  }

  if (txError) {
    console.error('Order payout transaction log error:', JSON.stringify(txError))
    return { success: false, error: 'Unable to record payout transaction' }
  }

  const now = new Date().toISOString()
  const updateAttempts: Array<Record<string, any>> = [
    {
      status: 'completed',
      confirmed_at: now,
      completed_at: now,
      updated_at: now,
    },
    {
      status: 'completed',
      approved_at: now,
      completed_at: now,
      updated_at: now,
    },
    {
      status: 'completed',
      updated_at: now,
    },
  ]

  let orderUpdateError: any = null
  for (const payload of updateAttempts) {
    const result = await (db
      .from('orders') as any)
      .update(payload)
      .eq('id', order.id)

    orderUpdateError = result.error
    if (!orderUpdateError) {
      break
    }
  }

  if (orderUpdateError) {
    console.error('Order complete update error:', orderUpdateError)
    return { success: false, error: 'Unable to finalize order' }
  }

  const { data: sellerStats, error: sellerStatsError } = await (db
    .from('users') as any)
    .select('id, completed_orders')
    .eq('id', sellerUser.id)
    .maybeSingle()

  if (!sellerStatsError && sellerStats) {
    const completedOrders = Number((sellerStats as any).completed_orders ?? 0)
    const { error: sellerCompletedUpdateError } = await (db
      .from('users') as any)
      .update({ completed_orders: completedOrders + 1 })
      .eq('id', sellerUser.id)

    if (sellerCompletedUpdateError && sellerCompletedUpdateError.code !== '42703' && sellerCompletedUpdateError.code !== 'PGRST204') {
      console.error('Seller completed_orders update error:', sellerCompletedUpdateError)
    }
  }

  return { success: true }
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

    if (!auth || auth.role !== 'customer') {
      return NextResponse.json({ error: 'Only customers can confirm delivery' }, { status: 403 })
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
        console.error('Confirm order lookup error:', JSON.stringify(orderError))
      }
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.customer_id !== auth.id) {
      return NextResponse.json({ error: 'Only the customer can confirm delivery' }, { status: 403 })
    }

    const deliveredAt = order.delivered_at ?? order.approved_at ?? null
    const confirmedAt = order.confirmed_at ?? order.completed_at ?? null

    if (order.status === 'disputed') {
      return NextResponse.json({ error: 'Cannot confirm delivery while this order is disputed' }, { status: 400 })
    }

    if (!deliveredAt && order.status !== 'delivered') {
      return NextResponse.json({ error: 'Seller has not marked this order as delivered yet' }, { status: 400 })
    }

    if (confirmedAt || order.status === 'completed') {
      return NextResponse.json({ error: 'Delivery is already confirmed' }, { status: 400 })
    }

    const result = await releaseOrderFunds(order)
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Unable to confirm delivery' }, { status: 500 })
    }

    await addOrderEvent(db, {
      orderId: id,
      type: 'completed',
      message: 'Order completed',
      userId: auth.id,
    })

    const { data: customer } = await (db
      .from('users') as any)
      .select('telegram_id')
      .eq('id', auth.id)
      .maybeSingle()

    if (customer?.telegram_id) {
      void telegramService
        .sendMessage(customer.telegram_id, telegramService.orderUpdatedMessage(String(id), 'Completed'))
        .catch((err) => {
          console.warn('[Orders][Confirm] Customer notify skipped:', err instanceof Error ? err.message : String(err))
        })
    }

    return NextResponse.json({ success: true, message: 'Delivery confirmed and funds released' })
  } catch (error) {
    console.error('Confirm delivery error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
