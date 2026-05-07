import { NextRequest, NextResponse } from 'next/server'

import {
  supabaseServer as supabase,
  supabaseAdmin,
} from '@/lib/db'

import {
  verifyToken,
  resolveUserId,
} from '@/lib/auth'

import { telegramService } from '@/lib/telegram-service'

import { addOrderEvent } from '@/lib/order-events'

import { z } from 'zod'

const pickOrderSchema =
  z.object({
    order_id:
      z.string().uuid(),
  })

function isUUID(
  value: string
) {
  return /^[0-9a-fA-F-]{36}$/.test(
    value
  )
}

export async function POST(
  request: NextRequest
) {
  try {
    // =====================================================
    // AUTH
    // =====================================================

    const authHeader =
      request.headers.get(
        'authorization'
      )

    if (
      !authHeader ||
      !authHeader.startsWith(
        'Bearer '
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Unauthorized',
        },
        { status: 401 }
      )
    }

    const token =
      authHeader.substring(7)

    const auth =
      verifyToken(token)

    if (
      !auth ||
      auth.role !== 'seller'
    ) {
      return NextResponse.json(
        {
          error:
            'Only sellers can pick orders',
        },
        { status: 403 }
      )
    }

    // =====================================================
    // BODY
    // =====================================================

    const body =
      await request.json()

    const {
      order_id,
    } =
      pickOrderSchema.parse(
        body
      )

    if (
      !isUUID(order_id)
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid order id',
        },
        { status: 400 }
      )
    }

    const db =
      supabaseAdmin ??
      supabase

    // =====================================================
    // RESOLVE USER
    // =====================================================

    const resolvedUserId =
      await resolveUserId(
        auth,
        db
      )

    // =====================================================
    // USER
    // =====================================================

    const {
      data: sellerUser,
      error:
        sellerUserError,
    } = await db
      .from('users')
      .select(`
        id,
        role,
        status
      `)
      .eq(
        'id',
        resolvedUserId
      )
      .single()

    if (
      sellerUserError ||
      !sellerUser
    ) {
      return NextResponse.json(
        {
          error:
            'Seller not found',
        },
        { status: 404 }
      )
    }

    if (
      sellerUser.status !==
      'approved'
    ) {
      return NextResponse.json(
        {
          error:
            'Only approved sellers can pick orders',
        },
        { status: 403 }
      )
    }

    // =====================================================
    // ORDER
    // =====================================================

    const {
      data: order,
      error: orderError,
    } = await db
      .from('orders')
      .select(`
        id,
        status,
        assigned_seller_id,
        points_amount,
        customer_id,
        category_id,
        product_id
      `)
      .eq(
        'id',
        order_id
      )
      .maybeSingle()

    if (
      orderError ||
      !order
    ) {
      return NextResponse.json(
        {
          error:
            'Order not found',
        },
        { status: 404 }
      )
    }

    if (
      order.status !==
        'pending' ||
      order.assigned_seller_id
    ) {
      return NextResponse.json(
        {
          error:
            'Order already picked',
        },
        { status: 409 }
      )
    }

    // =====================================================
    // CATEGORY VALIDATION
    // =====================================================

    if (
      !order.category_id ||
      !isUUID(
        order.category_id
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid order category',
        },
        { status: 400 }
      )
    }

    // =====================================================
    // SELLER CATEGORY ACCESS
    // =====================================================

    const {
      data:
        sellerCategory,
      error:
        sellerCategoryError,
    } = await db
      .from(
        'seller_categories'
      )
      .select(`
        seller_id,
        category_id
      `)
      .eq(
        'seller_id',
        resolvedUserId
      )
      .eq(
        'category_id',
        order.category_id
      )
      .maybeSingle()

    if (
      sellerCategoryError
    ) {
      console.error(
        sellerCategoryError
      )

      return NextResponse.json(
        {
          error:
            sellerCategoryError.message,
        },
        { status: 500 }
      )
    }

    if (
      !sellerCategory
    ) {
      return NextResponse.json(
        {
          error:
            'You are not assigned to this category',
        },
        { status: 403 }
      )
    }

    // =====================================================
    // PICK ORDER
    // =====================================================

    const {
      data: pickedOrder,
      error: pickError,
    } = await db
      .from('orders')
      .update({
        assigned_seller_id:
          resolvedUserId,

        status:
          'in_progress',

        picked_at:
          new Date().toISOString(),
      })
      .eq(
        'id',
        order_id
      )
      .eq(
        'status',
        'pending'
      )
      .is(
        'assigned_seller_id',
        null
      )
      .select(`
        id,
        points_amount
      `)
      .maybeSingle()

    if (
      pickError ||
      !pickedOrder
    ) {
      return NextResponse.json(
        {
          error:
            'Order already picked',
        },
        { status: 409 }
      )
    }

    // =====================================================
    // SELLER EARNINGS
    // =====================================================

    const gross =
      Number(
        pickedOrder.points_amount ??
          order.points_amount ??
          0
      )

    const seller_earnings =
      gross

    await db
      .from('orders')
      .update({
        seller_earnings,
      })
      .eq(
        'id',
        order_id
      )

    // =====================================================
    // LOGS
    // =====================================================

    await db
      .from('order_logs')
      .insert({
        order_id,

        seller_id:
          resolvedUserId,

        action:
          'accept',

        result:
          'success',

        details: {
          seller_earnings,
        },
      })

    // =====================================================
    // EVENTS
    // =====================================================

    await addOrderEvent(
      db,
      {
        orderId:
          order_id,

        type:
          'accepted',

        message:
          'Seller accepted the order',

        userId:
          resolvedUserId,
      }
    )

    // =====================================================
    // TELEGRAM
    // =====================================================

    const {
      data: customer,
    } = await db
      .from('users')
      .select(`
        telegram_id
      `)
      .eq(
        'id',
        order.customer_id
      )
      .maybeSingle()

    if (
      customer?.telegram_id
    ) {
      void telegramService
        .sendMessage(
          customer.telegram_id,
          telegramService.orderUpdatedMessage(
            String(order_id),
            'In Progress'
          )
        )
        .catch((err) => {
          console.warn(
            '[Orders][Pick] Telegram notify skipped:',
            err instanceof Error
              ? err.message
              : String(err)
          )
        })
    }

    // =====================================================
    // RESPONSE
    // =====================================================

    return NextResponse.json(
      {
        success: true,

        message:
          'Order picked successfully',

        order_id,

        seller_earnings,
      },
      { status: 200 }
    )
  } catch (error) {
    if (
      error instanceof
      z.ZodError
    ) {
      return NextResponse.json(
        {
          error:
            'Validation error',

          details:
            error.errors,
        },
        { status: 400 }
      )
    }

    console.error(
      'Pick order error:',
      error
    )

    return NextResponse.json(
      {
        error:
          'Internal server error',
      },
      { status: 500 }
    )
  }
}
