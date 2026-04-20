import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { decryptGameAccountSecret } from '@/lib/game-account-secrets'
import { telegramService } from '@/lib/telegram-service'
import { addOrderEvent } from '@/lib/order-events'
import { calculateTrustScore } from '@/lib/trust-score'

const MAX_CANCELLATIONS_PER_DAY = 3

const updateOrderSchema = z.object({
  status: z.string(),
  cancel_reason: z.string().optional(),
})

function normalizeOrderStatus(status: string) {
  // Backward compatibility: older callback handlers used "accepted".
  if (status === 'accepted') return 'in_progress'
  return status
}

function getCancellationRefundAmount(order: any) {
  const orderAmount = Number(order.points_amount ?? 0)
  const platformFee = Number(order.platform_fee ?? 0)
  return orderAmount + platformFee
}

async function hasCancellationRefund(orderId: string) {
  const { data, error } = await supabase
    .from('point_transactions')
    .select('id')
    .eq('reference_id', orderId)
    .or('transaction_type.eq.refund,type.eq.refund')
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Cancellation refund lookup error:', error)
    return false
  }

  return Boolean(data)
}

async function refundCancelledOrder(order: any) {
  const refundAmount = getCancellationRefundAmount(order)

  if (refundAmount <= 0 || !order.customer_id) {
    return { success: true }
  }

  const { data: customer, error: customerError } = await supabase
    .from('users')
    .select('id, points, telegram_id')
    .eq('id', order.customer_id)
    .single()

  if (customerError || !customer) {
    return { success: false, error: 'Customer not found for refund' }
  }

  const previousPoints = Number(customer.points ?? 0)
  const newPoints = previousPoints + refundAmount

  const { error: userUpdateError } = await supabase
    .from('users')
    .update({ points: newPoints })
    .eq('id', customer.id)

  if (userUpdateError) {
    console.error('Cancellation refund update error:', userUpdateError)
    return { success: false, error: 'Unable to refund customer points' }
  }

  const transactionAttempts = [
    {
      user_id: customer.id,
      amount: refundAmount,
      transaction_type: 'refund',
      status: 'completed',
      reference_id: order.id,
      related_order_id: order.id,
      description: 'Refund after order cancellation',
      balance_before: previousPoints,
      balance_after: newPoints,
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
    const { error: txError } = await supabase
      .from('point_transactions')
      .insert(payload)

    if (!txError) {
      break
    }
  }

  if (customer.telegram_id) {
    void telegramService
      .sendMessage(
        customer.telegram_id,
        telegramService.pointsTransactionMessage(refundAmount, newPoints)
      )
      .catch((err) => {
        console.warn('[Orders][Cancel] Telegram refund notify skipped:', err instanceof Error ? err.message : String(err))
      })
  }

  return { success: true }
}

async function releaseOrderFunds(order: any) {
  if (!order.assigned_seller_id) {
    return { success: false, error: 'Order has no assigned seller' }
  }

  if (order.status === 'completed' || order.confirmed_at) {
    return { success: true }
  }

  const sellerEarnings = Number(order.seller_earnings ?? 0)
  const paymentAmount = Number(order.points_amount ?? 0)
  const payoutAmount = sellerEarnings > 0 ? sellerEarnings : paymentAmount

  if (payoutAmount <= 0) {
    return { success: false, error: 'No seller payout is configured for this order' }
  }

  const { data: sellerUser, error: sellerUserError } = await supabase
    .from('users')
    .select('id, balance, points')
    .eq('id', order.assigned_seller_id)
    .single()

  if (sellerUserError || !sellerUser) {
    return { success: false, error: 'Seller user not found' }
  }

  const previousBalance = Number(sellerUser.balance ?? 0)
  const newBalance = previousBalance + payoutAmount
  const previousTotalPoints = Number(sellerUser.points ?? 0)
  const newTotalPoints = previousTotalPoints + payoutAmount

  const { error: userUpdateError } = await supabase
    .from('users')
    .update({
      balance: newBalance,
      points: newTotalPoints,
    })
    .eq('id', sellerUser.id)

  if (userUpdateError) {
    console.error('Seller balance update error:', userUpdateError)
    return { success: false, error: 'Unable to credit seller account' }
  }

  const { error: txError } = await supabase
    .from('point_transactions')
    .insert({
      user_id: sellerUser.id,
      amount: payoutAmount,
      transaction_type: 'order',
      fee: platformFee,
      status: 'completed',
      reference_id: order.id,
      related_order_id: order.id,
      description: 'Order confirmation payout',
      balance_before: previousBalance,
      balance_after: newBalance,
    })

  if (txError) {
    console.error('Order payout transaction log error:', txError)
    return { success: false, error: 'Unable to record payout transaction' }
  }

  const now = new Date().toISOString()
  const { error: orderUpdateError } = await supabase
    .from('orders')
    .update({
      status: 'completed',
      confirmed_at: now,
      completed_at: now,
      updated_at: now,
    })
    .eq('id', order.id)

  if (orderUpdateError) {
    console.error('Order complete update error:', orderUpdateError)
    return { success: false, error: 'Unable to finalize order' }
  }

  const { data: sellerStats, error: sellerStatsError } = await supabase
    .from('users')
    .select('id, completed_orders')
    .eq('id', sellerUser.id)
    .maybeSingle()

  if (!sellerStatsError && sellerStats) {
    const currentCompletedOrders = Number((sellerStats as any).completed_orders ?? 0)
    const { error: sellerCompletedUpdateError } = await supabase
      .from('users')
      .update({ completed_orders: currentCompletedOrders + 1 })
      .eq('id', sellerUser.id)

    if (sellerCompletedUpdateError && (sellerCompletedUpdateError as any).code !== '42703' && (sellerCompletedUpdateError as any).code !== 'PGRST204') {
      console.error('Seller completed_orders update error:', sellerCompletedUpdateError)
    }
  }

  return { success: true }
}

async function handleAutoConfirm(order: any) {
  if (!order.delivered_at || order.confirmed_at || !order.auto_release_at) {
    return { success: false }
  }

  const autoReleaseDate = new Date(order.auto_release_at)
  if (autoReleaseDate <= new Date()) {
    return releaseOrderFunds(order)
  }

  return { success: false }
}

// ================= GET ORDER =================
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

    const fetchOrderWithRelations = async (orderId: string) => {
      const base = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single()

      if (base.error || !base.data) {
        return { data: base.data, error: base.error }
      }

      const nextOrder: any = {
        ...base.data,
        seller: null,
        customer: null,
        offer: null,
        game_account: null,
      }

      if (nextOrder.assigned_seller_id) {
        let sellerResult = await supabase
          .from('users')
          .select('username, avatar_url, rating, total_reviews, completed_orders, dispute_count')
          .eq('id', nextOrder.assigned_seller_id)
          .maybeSingle()

        if (sellerResult.error && ((sellerResult.error as any).code === '42703' || (sellerResult.error as any).code === 'PGRST204')) {
          sellerResult = await supabase
            .from('users')
            .select('username, avatar_url')
            .eq('id', nextOrder.assigned_seller_id)
            .maybeSingle()
        }

        if (sellerResult.data) {
          nextOrder.seller = {
            ...sellerResult.data,
            trust_score: calculateTrustScore(sellerResult.data as any),
          }
        }
      }

      if (nextOrder.customer_id) {
        const customerResult = await supabase
          .from('users')
          .select('username')
          .eq('id', nextOrder.customer_id)
          .maybeSingle()

        if (customerResult.data) {
          nextOrder.customer = customerResult.data
        }
      }

      if (nextOrder.game_account_id) {
        const accountResult = await supabase
          .from('game_accounts')
          .select('id, account_identifier, account_email, account_password_encrypted, game_id')
          .eq('id', nextOrder.game_account_id)
          .maybeSingle()

        if (accountResult.data) {
          nextOrder.game_account = accountResult.data
        }
      }

      if (nextOrder.offer_id) {
        const offerResult = await supabase
          .from('offers')
          .select('id, name, points_price, product_id')
          .eq('id', nextOrder.offer_id)
          .maybeSingle()

        if (offerResult.data) {
          const productResult = await supabase
            .from('products')
            .select('id, name, game_id')
            .eq('id', offerResult.data.product_id)
            .maybeSingle()

          let gameData: any = null
          if (productResult.data?.game_id) {
            const gameResult = await supabase
              .from('games')
              .select('name')
              .eq('id', productResult.data.game_id)
              .maybeSingle()
            gameData = gameResult.data ? { name: gameResult.data.name } : null
          }

          nextOrder.offer = {
            name: offerResult.data.name,
            points_price: offerResult.data.points_price,
            product: {
              name: productResult.data?.name ?? null,
              game: gameData,
            },
          }
        } else {
          // Fallback when offers table is missing and order.offer_id stores product id.
          const productFallback = await supabase
            .from('products')
            .select('id, name, points_price, game_id')
            .eq('id', nextOrder.offer_id)
            .maybeSingle()

          if (productFallback.data) {
            let gameData: any = null
            if (productFallback.data.game_id) {
              const gameResult = await supabase
                .from('games')
                .select('name')
                .eq('id', productFallback.data.game_id)
                .maybeSingle()
              gameData = gameResult.data ? { name: gameResult.data.name } : null
            }

            nextOrder.offer = {
              name: productFallback.data.name,
              points_price: productFallback.data.points_price,
              product: {
                name: productFallback.data.name,
                game: gameData,
              },
            }
          }
        }
      }

      if (!nextOrder.offer) {
        const fallbackProductName =
          nextOrder.product_name ??
          nextOrder.offer_name ??
          nextOrder.title ??
          'Order service'

        let fallbackGameName: string | null =
          nextOrder.game_name ??
          null

        const gameIdFromOrder =
          nextOrder.game_id ??
          nextOrder.game_account?.game_id ??
          null

        if (!fallbackGameName && gameIdFromOrder) {
          const fallbackGame = await supabase
            .from('games')
            .select('name')
            .eq('id', gameIdFromOrder)
            .maybeSingle()

          fallbackGameName = fallbackGame.data?.name ?? null
        }

        nextOrder.offer = {
          name: fallbackProductName,
          points_price: Number(nextOrder.points_amount ?? 0),
          product: {
            name: fallbackProductName,
            game: fallbackGameName ? { name: fallbackGameName } : null,
          },
        }
      }

      return { data: nextOrder, error: null }
    }

    const orderResponse = await fetchOrderWithRelations(id)

    let order = orderResponse.data
    const error = orderResponse.error

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const isAuthorized =
      order.customer_id === auth.id ||
      order.assigned_seller_id === auth.id ||
      auth.role === 'admin'

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const autoConfirmResult = await handleAutoConfirm(order)
    if (autoConfirmResult.success) {
      const refreshed = await fetchOrderWithRelations(id)

      if (!refreshed.error && refreshed.data) {
        order = refreshed.data
      }
    }

    // 🔒 Hide account before seller picks order
    if (auth.role === 'seller' && auth.id !== order.assigned_seller_id) {
      delete order.game_account_id
      delete order.game_account
    } else if (order.game_account) {
      const decryptedPassword = decryptGameAccountSecret(order.game_account.account_password_encrypted)
      order.game_account = {
        ...order.game_account,
        account_password: decryptedPassword,
      }
      delete order.game_account.account_password_encrypted
    }

    const unitPrice = Number(order.offer?.points_price ?? 0)
    const totalAmount = Number(order.points_amount ?? 0)
    const quantity = unitPrice > 0 ? Math.max(1, Math.round(totalAmount / unitPrice)) : 1
    const platformFee = Number(order.platform_fee ?? 1)
    const totalCharge = totalAmount + platformFee

    const deliveredAt = order.delivered_at ?? order.approved_at ?? null
    const confirmedAt = order.confirmed_at ?? order.completed_at ?? null
    const normalizedStatus = normalizeOrderStatus(order.status)
    const displayStatus = normalizedStatus === 'in_progress' && deliveredAt ? 'delivered' : normalizedStatus

    return NextResponse.json({
      success: true,
      order: {
        ...order,
        quantity,
        platform_fee: platformFee,
        total_charge: totalCharge,
        delivered_at: deliveredAt,
        confirmed_at: confirmedAt,
        status: displayStatus,
      },
    })
  } catch (error) {
    console.error('Get order error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ================= UPDATE ORDER =================
async function updateOrderStatus(
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
    const { status, cancel_reason } = updateOrderSchema.parse(body)
    const normalizedStatus = normalizeOrderStatus(status)

    if (!normalizedStatus) {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      )
    }

    // 🔍 Get order
    const { data: order, error } = await supabase
      .from('orders')
      .select('customer_id, assigned_seller_id, status, points_amount, platform_fee')
      .eq('id', id)
      .single()

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const isSeller = auth.role === 'seller'
    const isCustomer = auth.role === 'customer'
    const isAdmin = auth.role === 'admin'

    // 🔒 Only assigned seller can mark completed
    if (normalizedStatus === 'completed' && auth.id !== order.assigned_seller_id) {
      return NextResponse.json(
        { error: 'Only assigned seller can complete order' },
        { status: 403 }
      )
    }

    if (order.status === 'disputed' && !isAdmin) {
      return NextResponse.json({ error: 'Order changes are disabled while a dispute is active' }, { status: 400 })
    }

    if (normalizedStatus === 'cancelled') {
      const alreadyRefunded = await hasCancellationRefund(id)

      if (order.status === 'cancelled' && alreadyRefunded) {
        return NextResponse.json({ error: 'Order is already cancelled' }, { status: 400 })
      }

      if (order.status === 'completed') {
        return NextResponse.json({ error: 'Completed orders cannot be cancelled' }, { status: 400 })
      }

      if (!isAdmin) {
        if (isCustomer && order.status !== 'open') {
          return NextResponse.json(
            { error: 'Customers can only cancel orders before seller accepts' },
            { status: 403 }
          )
        }

        if (isSeller && !['open', 'in_progress', 'accepted'].includes(order.status)) {
          return NextResponse.json(
            { error: 'Sellers can only reject active orders before completion' },
            { status: 403 }
          )
        }

        const identityField = isSeller ? 'assigned_seller_id' : 'customer_id'
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { count: cancelCount, error: cancelCountError } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq(identityField, auth.id)
          .eq('status', 'cancelled')
          .gte('updated_at', since)

        if (cancelCountError) {
          console.error('Cancel rate limit check failed:', cancelCountError)
          return NextResponse.json(
            { error: 'Unable to validate cancellation limit' },
            { status: 500 }
          )
        }

        if ((cancelCount ?? 0) >= MAX_CANCELLATIONS_PER_DAY) {
          return NextResponse.json(
            { error: `You have reached the maximum of ${MAX_CANCELLATIONS_PER_DAY} cancellations in the last 24 hours` },
            { status: 429 }
          )
        }
      }

      if (!cancel_reason?.trim()) {
        return NextResponse.json(
          { error: 'Cancellation reason is required' },
          { status: 400 }
        )
      }
    }

    // 🔒 Authorization check
    const isAuthorized =
      order.customer_id === auth.id ||
      order.assigned_seller_id === auth.id ||
      auth.role === 'admin'

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const updatePayload: any = {
      status: normalizedStatus,
      updated_at: new Date().toISOString(),
    }

    if (normalizedStatus === 'cancelled') {
      updatePayload.cancel_reason = cancel_reason?.trim() ?? null
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', id)

    if (updateError) {
      if (updatePayload.cancel_reason && updateError.message?.includes('cancel_reason')) {
        console.warn('Orders table missing cancel_reason column, retrying update without it')
        delete updatePayload.cancel_reason

        const { error: retryError } = await supabase
          .from('orders')
          .update(updatePayload)
          .eq('id', id)

        if (!retryError) {
          if (normalizedStatus === 'cancelled') {
            await addOrderEvent(supabase, {
              orderId: id,
              type: 'cancelled',
              message: `Order cancelled: ${cancel_reason?.trim() ?? 'No reason provided'}`,
              userId: auth.id,
            })
          }

          return NextResponse.json({
            success: true,
            message: normalizedStatus === 'cancelled'
              ? 'Order cancelled successfully'
              : 'Order updated successfully',
          })
        }
      }

      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    if (normalizedStatus === 'cancelled') {
      const refundAlreadyRecorded = await hasCancellationRefund(id)

      if (!refundAlreadyRecorded) {
        const refundResult = await refundCancelledOrder(order)
        if (!refundResult.success) {
          console.error('Cancellation refund failed:', refundResult.error)
          return NextResponse.json(
            { error: refundResult.error || 'Order cancelled but refund failed' },
            { status: 500 }
          )
        }
      }

      await addOrderEvent(supabase, {
        orderId: id,
        type: 'cancelled',
        message: `Order cancelled: ${cancel_reason?.trim() ?? 'No reason provided'}`,
        userId: auth.id,
      })
    }

    if (normalizedStatus === 'cancelled') {
      // Cancellation refunds are handled above so the customer gets points back.
    }

    const recipients: Array<string> = []

    const { data: customer } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('id', order.customer_id)
      .maybeSingle()

    if (customer?.telegram_id) {
      recipients.push(customer.telegram_id)
    }

    if (order.assigned_seller_id) {
      const { data: seller } = await supabase
        .from('users')
        .select('telegram_id')
        .eq('id', order.assigned_seller_id)
        .maybeSingle()

      if (seller?.telegram_id) {
        recipients.push(seller.telegram_id)
      }
    }

    if (recipients.length > 0) {
      const message = telegramService.orderUpdatedMessage(String(id), String(normalizedStatus))
      await Promise.allSettled(
        recipients.map((chatId) =>
          telegramService.sendMessage(chatId, message).catch((err) => {
            console.warn('[Orders][Update] Telegram notify skipped:', err instanceof Error ? err.message : String(err))
          })
        )
      )
    }

    return NextResponse.json({
      success: true,
      message: normalizedStatus === 'cancelled' ? 'Order cancelled successfully' : 'Order updated successfully',
    })
  } catch (error) {
    console.error('Update order error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return updateOrderStatus(request, context)
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return updateOrderStatus(request, context)
}
