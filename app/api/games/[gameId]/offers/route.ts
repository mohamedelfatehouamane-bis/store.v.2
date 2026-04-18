import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params

    if (!gameId) {
      return NextResponse.json({ error: 'Game ID is required' }, { status: 400 })
    }

    // First, verify the game exists
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, name')
      .eq('id', gameId)
      .eq('is_active', true)
      .single()

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const gameRow: any = game

    // Get all products for this game
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, description, image_url, points_price, type')
      .eq('game_id', gameId)
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (productsError) {
      console.error('Products query error:', productsError)
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
    }

    if (!products || products.length === 0) {
      return NextResponse.json({ 
        game: { id: gameRow.id, name: gameRow.name },
        offers: [] 
      })
    }

    const productIds = products.map((p: any) => p.id)

    // Get all offers for these products
    const { data: offers, error: offersError } = await supabase
      .from('offers')
      .select('id, product_id, name, quantity, unit, points_price')
      .in('product_id', productIds)
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (offersError) {
      // Some deployments no longer have an offers table; use products directly.
      if (offersError.code === 'PGRST205') {
        const fallbackOffers = (products ?? [])
          .filter((product: any) => !product.type || product.type === 'admin')
          .map((product: any) => ({
          id: product.id,
          product_id: product.id,
          name: product.name || 'Unnamed Offer',
          description: product.description || '',
          image_url: product.image_url || '',
          quantity: 1,
          unit: 'item',
          points_price: Number(product.points_price ?? 0),
          }))

        return NextResponse.json({
          game: {
            id: gameRow.id,
            name: gameRow.name,
          },
          offers: fallbackOffers,
        })
      }

      console.error('Offers query error:', offersError)
      return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 })
    }

    // Create a product map for quick lookup
    const productMap = new Map<string, any>()
    products.forEach((product: any) => {
      productMap.set(product.id, product)
    })

    // Combine offers with product data
    const enrichedOffers = (offers ?? []).map((offer: any) => {
      const product = productMap.get(offer.product_id)
      return {
        id: offer.id,
        product_id: offer.product_id,
        name: offer.name || product?.name || 'Unnamed Offer',
        description: product?.description || '',
        image_url: product?.image_url || '',
        quantity: offer.quantity,
        unit: offer.unit,
        points_price: offer.points_price,
      }
    })

    return NextResponse.json({
      game: {
        id: gameRow.id,
        name: gameRow.name,
      },
      offers: enrichedOffers,
    })
  } catch (error) {
    console.error('Game offers API unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
