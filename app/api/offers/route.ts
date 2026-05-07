import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as supabase } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // categoryId is the NEW structure
    const categoryId = searchParams.get('categoryId')

    // optional seller filter
    const sellerId = searchParams.get('sellerId')

    if (!categoryId) {
      return NextResponse.json(
        {
          success: false,
          error: 'categoryId is required',
          offers: [],
        },
        { status: 400 }
      )
    }

    // Validate seller assignment to category
    if (sellerId) {
      const {
        data: sellerAssignment,
        error: assignmentError,
      } = await supabase
        .from('seller_categories')
        .select('seller_id')
        .eq('seller_id', sellerId)
        .eq('category_id', categoryId)
        .single()

      if (assignmentError && assignmentError.code !== 'PGRST116') {
        console.error(
          'Offers API seller assignment error:',
          assignmentError
        )

        return NextResponse.json(
          {
            success: false,
            error: 'Failed to validate seller assignment',
            offers: [],
          },
          { status: 500 }
        )
      }

      if (!sellerAssignment) {
        return NextResponse.json({
          success: true,
          offers: [],
        })
      }
    }

    // Load products by category
    const {
      data: products,
      error: productsError,
    } = await supabase
      .from('products')
      .select(`
        id,
        name,
        points_price,
        category_id,
        is_active
      `)
      .eq('category_id', categoryId)
      .eq('is_active', true)

    if (productsError) {
      console.error(
        'Offers API products error:',
        productsError
      )

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to load products',
          offers: [],
        },
        { status: 500 }
      )
    }

    // No products found
    if (!products || products.length === 0) {
      return NextResponse.json({
        success: true,
        offers: [],
      })
    }

    // Convert products to marketplace offers
    const offers = products.map((product: any) => ({
      id: product.id,
      product_id: product.id,

      // compatibility with old frontend
      offer_id: product.id,

      name: product.name || 'Unnamed Product',

      quantity: 1,

      unit: 'item',

      price: Number(product.points_price ?? 0),

      points_price: Number(product.points_price ?? 0),

      category_id: product.category_id,
    }))

    return NextResponse.json({
      success: true,
      offers,
    })
  } catch (error) {
    console.error(
      'Offers API unexpected error:',
      error
    )

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        offers: [],
      },
      { status: 500 }
    )
  }
}
