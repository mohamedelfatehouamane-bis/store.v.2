import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const gameId = searchParams.get('gameId')
    const sellerId = searchParams.get('sellerId')

    if (!gameId) {
      return NextResponse.json({ offers: [] })
    }

    if (sellerId) {
      const { data: assignments, error: assignmentError } = await supabase
        .from('seller_games')
        .select('id')
        .eq('seller_id', sellerId)
        .eq('game_id', gameId)
        .limit(1)

      if (assignmentError) {
        console.error('Offers API seller assignment error:', assignmentError)
        return NextResponse.json({ offers: [] }, { status: 500 })
      }

      if (!assignments || assignments.length === 0) {
        return NextResponse.json({ offers: [] })
      }
    }

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, points_price')
      .eq('game_id', gameId)
      .eq('is_active', true)

    if (productsError) {
      console.error('Offers API products error:', productsError)
      return NextResponse.json({ offers: [] }, { status: 500 })
    }

    const productIds = (products ?? []).map((product: any) => product.id)
    if (productIds.length === 0) {
      return NextResponse.json({ offers: [] })
    }

    const { data: offers, error: offersError } = await supabase
      .from('offers')
      .select('id, quantity, unit, points_price, product_id')
      .in('product_id', productIds)
      .eq('is_active', true)

    if (offersError) {
      if (offersError.code === 'PGRST205') {
        const fallbackPayload = (products ?? []).map((product: any) => ({
          offer_id: product.id,
          name: product.name || 'Unnamed offer',
          quantity: 1,
          unit: 'item',
          price: Number(product.points_price ?? 0),
        }))

        return NextResponse.json({ offers: fallbackPayload })
      }

      console.error('Offers API offers error:', offersError)
      return NextResponse.json({ offers: [] }, { status: 500 })
    }

    const productMap = new Map<string, string>()
    ;(products ?? []).forEach((product: any) => {
      if (product.id) {
        productMap.set(product.id, product.name || '')
      }
    })

    const payload = (offers ?? []).map((offer: any) => ({
      offer_id: offer.id,
      name: productMap.get(offer.product_id) ?? 'Unnamed offer',
      quantity: offer.quantity ?? 0,
      unit: offer.unit ?? '',
      price: offer.points_price ?? 0,
    }))

    return NextResponse.json({ offers: payload })
  } catch (error) {
    console.error('Offers API unexpected error:', error)
    return NextResponse.json({ offers: [] }, { status: 500 })
  }
}
