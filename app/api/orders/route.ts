import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { z } from 'zod'

const db: any = supabaseAdmin ?? supabase

const createOrderSchema = z.object({
  game_id: z.string().uuid(),
  product_id: z.string().uuid(),
  account_id: z.string().uuid(),
})

function getAuth(request: NextRequest) {
  const authHeader =
    request.headers.get('authorization')

  if (
    !authHeader ||
    !authHeader.startsWith('Bearer ')
  ) {
    return null
  }

  return verifyToken(
    authHeader.substring(7)
  )
}

export async function POST(
  request: NextRequest
) {
  try {
    const auth = getAuth(request)

    if (!auth) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
        },
        { status: 401 }
      )
    }

    if (auth.role !== 'customer') {
      return NextResponse.json(
        {
          error:
            'Only customers can create orders',
        },
        { status: 403 }
      )
    }

    const body = await request.json()

    const {
      game_id,
      product_id,
      account_id,
    } = createOrderSchema.parse(body)

    // =====================================================
    // GET PRODUCT
    // =====================================================

    const {
      data: product,
      error: productError,
    } = await db
      .from('products')
      .select(`
        id,
        name,
        points_price,
        category_id,
        game_id,
        is_active,

        games (
          id,
          name
        ),

        categories (
          id,
          name
        )
      `)
      .eq('id', product_id)
      .eq('is_active', true)
      .single()

    if (productError || !product) {
      console.error(
        'Product query error:',
        productError
      )

      return NextResponse.json(
        {
          error: 'Product not found',
        },
        { status: 404 }
      )
    }

    // =====================================================
    // VALIDATE GAME
    // =====================================================

    if (
      String(product.game_id) !==
      String(game_id)
    ) {
      return NextResponse.json(
        {
          error:
            'Selected product does not belong to this game',
        },
        { status: 400 }
      )
    }

    // =====================================================
    // GET CATEGORY SELLERS
    // =====================================================

    const {
      data: assignments,
      error: assignmentsError,
    } = await db
      .from('seller_categories')
      .select(`
        seller_id
      `)
      .eq(
        'category_id',
        product.category_id
      )

    if (assignmentsError) {
      console.error(
        'Seller assignment error:',
        assignmentsError
      )

      return NextResponse.json(
        {
          error:
            'Unable to load category sellers',
        },
        { status: 500 }
      )
    }

    if (
      !assignments ||
      assignments.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            'No sellers assigned to this category',
        },
        { status: 400 }
      )
    }

    // =====================================================
    // GET VALID SELLERS
    // =====================================================

    const sellerIds = assignments.map(
      (assignment: any) =>
        String(assignment.seller_id)
    )

    const {
      data: sellers,
      error: sellersError,
    } = await db
      .from('users')
      .select(`
        id,
        username,
        role,
        status
      `)
      .in('id', sellerIds)
      .eq('role', 'seller')

    if (sellersError) {
      console.error(
        'Seller query error:',
        sellersError
      )

      return NextResponse.json(
        {
          error:
            'Unable to load sellers',
        },
        { status: 500 }
      )
    }

    if (
      !sellers ||
      sellers.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            'No valid sellers found',
        },
        { status: 400 }
      )
    }

    // =====================================================
    // FILTER APPROVED SELLERS
    // =====================================================

    const approvedSellers =
      sellers.filter(
        (seller: any) =>
          seller.status ===
          'approved'
      )

    if (
      approvedSellers.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            'No approved sellers available',
        },
        { status: 400 }
      )
    }

    // =====================================================
    // PICK SELLER
    // =====================================================

    const selectedSeller =
      approvedSellers[0]

    const assignedSellerId =
      selectedSeller.id

    // =====================================================
    // VERIFY GAME ACCOUNT
    // =====================================================

    const {
      data: gameAccount,
      error: gameAccountError,
    } = await db
      .from('game_accounts')
      .select(`
        id,
        game_id,
        user_id
      `)
      .eq('id', account_id)
      .eq('user_id', auth.id)
      .single()

    if (
      gameAccountError ||
      !gameAccount
    ) {
      return NextResponse.json(
        {
          error:
            'Game account not found',
        },
        { status: 404 }
      )
    }

    if (
      String(gameAccount.game_id) !==
      String(game_id)
    ) {
      return NextResponse.json(
        {
          error:
            'Game account mismatch',
        },
        { status: 400 }
      )
    }

    // =====================================================
    // VERIFY CUSTOMER BALANCE
    // =====================================================

    const {
      data: customer,
      error: customerError,
    } = await db
      .from('users')
      .select(`
        id,
        points
      `)
      .eq('id', auth.id)
      .single()

    if (
      customerError ||
      !customer
    ) {
      return NextResponse.json(
        {
          error:
            'Customer not found',
        },
        { status: 404 }
      )
    }

    const pointsPrice = Number(
      product.points_price
    )

    if (
      Number(customer.points) <
      pointsPrice
    ) {
      return NextResponse.json(
        {
          error:
            'Insufficient points',
        },
        { status: 400 }
      )
    }

    // =====================================================
    // DEDUCT POINTS
    // =====================================================

    const newBalance =
      Number(customer.points) -
      pointsPrice

    const {
      error: balanceError,
    } = await db
      .from('users')
      .update({
        points: newBalance,
      })
      .eq('id', auth.id)

    if (balanceError) {
      console.error(
        'Balance update error:',
        balanceError
      )

      return NextResponse.json(
        {
          error:
            'Unable to deduct points',
        },
        { status: 500 }
      )
    }

    // =====================================================
    // CREATE ORDER
    // =====================================================

    const sellerEarnings =
      pointsPrice

    const {
      data: order,
      error: orderError,
    } = await db
      .from('orders')
      .insert({
        customer_id: auth.id,

        assigned_seller_id:
          assignedSellerId,

        product_id: product.id,

        game_account_id:
          account_id,

        points_amount:
          pointsPrice,

        seller_earnings:
          sellerEarnings,

        status: 'pending',

        product_name:
          product.name,

        game_name:
          product.games?.name ??
          '',

        category_id:
          product.category_id,
      })
      .select()
      .single()

    if (orderError || !order) {
      console.error(
        'Order creation error:',
        orderError
      )

      // REFUND CUSTOMER

      await db
        .from('users')
        .update({
          points:
            Number(customer.points),
        })
        .eq('id', auth.id)

      return NextResponse.json(
        {
          error:
            orderError?.message ??
            'Unable to create order',
        },
        { status: 500 }
      )
    }

    // =====================================================
    // CREATE TRANSACTION
    // =====================================================

    await db
      .from('point_transactions')
      .insert({
        user_id: auth.id,

        amount: -pointsPrice,

        transaction_type:
          'spend',

        related_order_id:
          order.id,

        description: `Purchased ${product.name}`,
      })

    return NextResponse.json(
      {
        success: true,
        order,
      },
      { status: 201 }
    )
  } catch (error) {
    if (
      error instanceof z.ZodError
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
      'Create order error:',
      error
    )

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
