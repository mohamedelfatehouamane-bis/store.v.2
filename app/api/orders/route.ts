import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { z } from 'zod'

const db: any = supabaseAdmin ?? supabase

const createOrderSchema = z.object({
  product_id: z.string().uuid(),
  account_id: z.string().uuid(),
})

function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  return verifyToken(authHeader.substring(7))
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const filter = searchParams.get('filter')

    let query = db
      .from('orders')
      .select(`
        id,
        customer_id,
        assigned_seller_id,
        product_id,
        game_account_id,
        points_amount,
        seller_earnings,
        status,
        product_name,
        game_name,
        created_at,
        products (
          name,
          points_price
        ),
        users!orders_customer_id_fkey (
          username
        ),
        game_accounts (
          game_id,
          games (
            name
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (filter === 'my-orders') {
      // Customer's orders
      query = query.eq('customer_id', auth.id)
    } else if (filter === 'my-tasks') {
      // Seller's assigned orders
      query = query.eq('assigned_seller_id', auth.id)
    } else if (auth.role === 'admin') {
      // Admin can see all orders
    } else {
      return NextResponse.json(
        {
          error: 'Invalid filter',
        },
        { status: 400 }
      )
    }

    const { data: orders, error } = await query

    if (error) {
      console.error('Orders query error:', error)
      return NextResponse.json(
        {
          error: 'Unable to load orders',
        },
        { status: 500 }
      )
    }

    // Transform the data to match expected format
    const transformedOrders = (orders ?? []).map((order: any) => ({
      id: order.id,
      product_name: order.product_name || order.products?.name,
      game_name: order.game_name || order.game_accounts?.games?.name,
      status: order.status,
      points_price: order.points_amount || order.products?.points_price || 0,
      seller_earnings: order.seller_earnings,
      created_at: order.created_at,
    }))

    return NextResponse.json({
      success: true,
      orders: transformedOrders,
    })
  } catch (error) {
    console.error('Get orders error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
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
          error: 'Only customers can create orders',
        },
        { status: 403 }
      )
    }

    const body = await request.json()

    const {
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
        is_active,
        categories (game_id)
      `)
      .eq('id', product_id)
      .eq('is_active', true)
      .single()

    if (productError || !product) {
      console.error('Product query error:', productError)

      return NextResponse.json(
        {
          error: 'Product not found',
        },
        { status: 404 }
      )
    }

    if (
      !product.category_id ||
      !product.categories ||
      !product.categories.game_id
    ) {
      return NextResponse.json(
        {
          error: 'Product category is invalid',
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
      .select('seller_id')
      .eq('category_id', product.category_id)

    if (assignmentsError) {
      console.error(
        'Seller assignment error:',
        assignmentsError
      )

      return NextResponse.json(
        {
          error: 'Unable to load category sellers',
        },
        { status: 500 }
      )
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json(
        {
          error: 'No sellers assigned to this category',
        },
        { status: 400 }
      )
    }

    // =====================================================
    // GET APPROVED SELLERS
    // =====================================================

    const sellerIds = assignments.map(
      (assignment: any) => assignment.seller_id
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
      .eq('status', 'approved')

    if (sellersError) {
      console.error('Seller query error:', sellersError)

      return NextResponse.json(
        {
          error: 'Unable to load sellers',
        },
        { status: 500 }
      )
    }

    if (!sellers || sellers.length === 0) {
      return NextResponse.json(
        {
          error: 'No approved sellers available',
        },
        { status: 400 }
      )
    }

    // =====================================================
    // PICK SELLER
    // =====================================================

    const selectedSeller = sellers[0]

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

    if (gameAccountError || !gameAccount) {
      return NextResponse.json(
        {
          error: 'Game account not found',
        },
        { status: 404 }
      )
    }

    if (
      String(gameAccount.game_id) !==
      String(product.categories.game_id)
    ) {
      return NextResponse.json(
        {
          error: 'Game account does not match product category game',
        },
        { status: 400 }
      )
    }

    // =====================================================
    // GET CUSTOMER
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

    if (customerError || !customer) {
      return NextResponse.json(
        {
          error: 'Customer not found',
        },
        { status: 404 }
      )
    }

    const pointsPrice = Number(product.points_price ?? 0)

    if (Number(customer.points) < pointsPrice) {
      return NextResponse.json(
        {
          error: 'Insufficient points',
        },
        { status: 400 }
      )
    }

    // =====================================================
    // DEDUCT CUSTOMER POINTS
    // =====================================================

    const newBalance =
      Number(customer.points) - pointsPrice

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
          error: 'Unable to deduct points',
        },
        { status: 500 }
      )
    }

    // =====================================================
    // CREATE ORDER
    // =====================================================

    const {
      data: order,
      error: orderError,
    } = await db
      .from('orders')
      .insert({
        customer_id: auth.id,

        assigned_seller_id:
          selectedSeller.id,

        product_id: product.id,

        game_account_id:
          account_id,

        points_amount:
          pointsPrice,

        seller_earnings:
          pointsPrice,

        status: 'pending',

        product_name:
          product.name,

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
          points: Number(customer.points),
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

        transaction_type: 'spend',

        related_order_id: order.id,

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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: error.errors,
        },
        { status: 400 }
      )
    }

    console.error('Create order error:', error)

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
