import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const token = authHeader.substring(7)
  const auth = verifyToken(token)

  if (!auth || auth.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Only admins can delete games' }, { status: 403 }) }
  }

  return { auth }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAdmin(request)
    if ('error' in authResult) {
      return authResult.error
    }

    const { id: gameId } = await params
    if (!gameId) {
      return NextResponse.json({ error: 'Missing game id' }, { status: 400 })
    }

    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, name')
      .eq('id', gameId)
      .maybeSingle()

    if (gameError) {
      console.error('Lookup game error:', gameError)
      return NextResponse.json({ error: gameError.message }, { status: 500 })
    }

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('id')
      .eq('game_id', gameId)

    if (productsError) {
      console.error('Fetch products error:', productsError)
      return NextResponse.json({ error: productsError.message }, { status: 500 })
    }

    const productIds = Array.from(new Set((productsData ?? []).map((product: any) => String(product.id))))

    let activeOrderCount = 0

    if (productIds.length > 0) {
      const { count: exclusiveOrderCount, error: exclusiveOrderError } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .in('exclusive_offer_id', productIds)

      if (exclusiveOrderError) {
        console.error('Fetch exclusive orders count error:', exclusiveOrderError)
        return NextResponse.json({ error: exclusiveOrderError.message }, { status: 500 })
      }

      activeOrderCount += exclusiveOrderCount ?? 0

      const { data: offers, error: offersError } = await supabase
        .from('offers')
        .select('id')
        .in('product_id', productIds)

      if (offersError) {
        console.error('Fetch offers error:', offersError)
        return NextResponse.json({ error: offersError.message }, { status: 500 })
      }

      const offerIds = Array.from(new Set((offers ?? []).map((offer: any) => String(offer.id))))

      if (offerIds.length > 0) {
        const { count: offerOrderCount, error: offerOrderError } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .in('offer_id', offerIds)

        if (offerOrderError) {
          console.error('Fetch offer orders count error:', offerOrderError)
          return NextResponse.json({ error: offerOrderError.message }, { status: 500 })
        }

        activeOrderCount += offerOrderCount ?? 0
      }
    }

    if (activeOrderCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete game with active orders' },
        { status: 400 }
      )
    }

    const { error: deleteAssignmentsError } = await supabase
      .from('seller_games')
      .delete()
      .eq('game_id', gameId)

    if (deleteAssignmentsError) {
      console.error('Delete seller assignments error:', deleteAssignmentsError)
      return NextResponse.json({ error: deleteAssignmentsError.message }, { status: 500 })
    }

    if (productIds.length > 0) {
      const { error: deleteOffersError } = await supabase
        .from('offers')
        .delete()
        .in('product_id', productIds)

      if (deleteOffersError) {
        console.error('Delete offers error:', deleteOffersError)
        return NextResponse.json({ error: deleteOffersError.message }, { status: 500 })
      }
    }

    const { error: deleteProductsError } = await supabase
      .from('products')
      .delete()
      .eq('game_id', gameId)

    if (deleteProductsError) {
      console.error('Delete products error:', deleteProductsError)
      return NextResponse.json({ error: deleteProductsError.message }, { status: 500 })
    }

    const { error: deleteCategoriesError } = await supabase
      .from('categories')
      .delete()
      .eq('game_id', gameId)

    if (deleteCategoriesError) {
      console.error('Delete categories error:', deleteCategoriesError)
      return NextResponse.json({ error: deleteCategoriesError.message }, { status: 500 })
    }

    const { error: deleteGameAccountsError } = await supabase
      .from('game_accounts')
      .delete()
      .eq('game_id', gameId)

    if (deleteGameAccountsError) {
      console.error('Delete game accounts error:', deleteGameAccountsError)
      return NextResponse.json({ error: deleteGameAccountsError.message }, { status: 500 })
    }

    const { error: deleteError } = await supabase.from('games').delete().eq('id', gameId)

    if (deleteError) {
      console.error('Delete game error:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Game "${game.name}" deleted and seller assignments removed`,
    })
  } catch (error) {
    console.error('Delete game API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
