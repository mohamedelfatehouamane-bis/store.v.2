import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { telegramService } from '@/lib/telegram-service'
import { addOrderEvent } from '@/lib/order-events'

const disputeUpdateSchema = z.object({
  status: z.enum(['open', 'reviewing', 'resolved', 'rejected']),
  admin_note: z.string().optional(),
})

function buildDisputeResolutionMessage(orderId: string, outcome: string) {
  return [`🔧 Dispute update`, `Order ID: #${orderId}`, `Outcome: ${outcome}`].join('\n')
}

export async function PATCH(
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

    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const { status, admin_note } = disputeUpdateSchema.parse(body)

    const { data: dispute, error: disputeError } = await supabaseAdmin
      .from('disputes')
      .select('id, order_id, status, previous_status')
      .eq('id', id)
      .single()

    if (disputeError || !dispute) {
      console.error('Dispute lookup error:', disputeError)
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 })
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, customer_id, status, points_amount, platform_fee')
      .eq('id', dispute.order_id)
      .single()

    if (orderError || !order) {
      console.error('Order lookup error:', orderError)
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const updates: Record<string, unknown> = {
      status,
      admin_note: admin_note?.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { error: disputeUpdateError } = await supabaseAdmin
      .from('disputes')
      .update(updates)
      .eq('id', id)

    if (disputeUpdateError) {
      console.error('Dispute update failed:', disputeUpdateError)
      return NextResponse.json({ error: 'Unable to update dispute' }, { status: 500 })
    }

    let orderStatusUpdate: Record<string, unknown> | null = null
    let eventType = 'dispute_reported'
    let eventMessage = `Dispute status changed to ${status}`

    if (status === 'resolved') {
      const refundAmount = Number(order.points_amount ?? 0) + Number(order.platform_fee ?? 0)
      const customerId = order.customer_id

      if (refundAmount > 0 && customerId) {
        const { data: customer, error: customerError } = await supabaseAdmin
          .from('users')
          .select('id, points, telegram_id')
          .eq('id', customerId)
          .single()

        if (!customerError && customer) {
          const previousPoints = Number(customer.points ?? 0)
          const nextPoints = previousPoints + refundAmount

          const { error: userUpdateError } = await supabaseAdmin
            .from('users')
            .update({ points: nextPoints })
            .eq('id', customer.id)

          if (userUpdateError) {
            console.error('Dispute refund update error:', userUpdateError)
          } else {
            const transactionAttempts = [
              {
                user_id: customer.id,
                amount: refundAmount,
                transaction_type: 'refund',
                status: 'completed',
                reference_id: order.id,
                related_order_id: order.id,
                description: 'Refund after dispute resolution',
                balance_before: previousPoints,
                balance_after: nextPoints,
              },
              {
                user_id: customer.id,
                amount: refundAmount,
                type: 'refund',
                status: 'completed',
                reference_id: order.id,
                related_order_id: order.id,
              },
              {
                user_id: customer.id,
                amount: refundAmount,
                status: 'completed',
                reference_id: order.id,
              },
            ]

            for (const payload of transactionAttempts) {
              const { error: txError } = await supabaseAdmin
                .from('point_transactions')
                .insert(payload)

              if (!txError) {
                break
              }
            }

            if (customer.telegram_id) {
              void telegramService
                .sendMessage(customer.telegram_id, buildDisputeResolutionMessage(order.id, 'Refund issued'))
                .catch((err) => {
                  console.warn('[Dispute][Resolve] Telegram notify skipped:', err instanceof Error ? err.message : String(err))
                })
            }
          }
        }
      }

      orderStatusUpdate = {
        status: 'cancelled',
        cancel_reason: 'Refund issued after dispute resolution',
        updated_at: new Date().toISOString(),
      }
      eventType = 'dispute_resolved'
      eventMessage = 'Dispute resolved by admin and refund issued'
    } else if (status === 'rejected') {
      const restoreStatus = dispute.previous_status || 'open'
      orderStatusUpdate = {
        status: restoreStatus,
        updated_at: new Date().toISOString(),
      }
      eventType = 'dispute_rejected'
      eventMessage = `Dispute rejected by admin and order restored to ${restoreStatus}`
    } else if (status === 'reviewing' || status === 'open') {
      orderStatusUpdate = {
        status: 'disputed',
        updated_at: new Date().toISOString(),
      }
      eventType = 'dispute_reported'
      eventMessage = status === 'reviewing' ? 'Dispute put under review' : 'Dispute reopened'
    }

    if (orderStatusUpdate) {
      const { error: orderUpdateError } = await supabaseAdmin
        .from('orders')
        .update(orderStatusUpdate)
        .eq('id', order.id)

      if (orderUpdateError) {
        console.error('Order status update during dispute resolution failed:', orderUpdateError)
      }
    }

    await addOrderEvent(supabaseAdmin, {
      orderId: order.id,
      type: eventType,
      message: eventMessage,
      userId: auth.id,
    })

    return NextResponse.json({ success: true, message: 'Dispute updated successfully' })
  } catch (error) {
    console.error('Admin dispute patch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
