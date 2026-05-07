import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { z } from 'zod'

const assignSellersSchema = z.object({
  sellerIds: z.array(z.string().uuid()).default([]),
})

const removeSellerSchema = z.object({
  sellerId: z.string().uuid(),
})

async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const token = authHeader.substring(7)
  const auth = verifyToken(token)

  if (!auth || auth.role !== 'admin') {
    return {
      error: NextResponse.json(
        { error: 'Only admins can manage seller assignments' },
        { status: 403 }
      ),
    }
  }

  return { auth }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAdmin(request)
    if ('error' in authResult) {
      return authResult.error
    }

    const { id } = await params
    const body = await request.json()
    const parsed = assignSellersSchema.parse(body)
    const sellerIds = Array.from(new Set(parsed.sellerIds))

    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id')
      .eq('id', id)
      .single()

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const {
      data: categories,
      error: categoriesError,
    } = await supabase
      .from('categories')
      .select('id')
      .eq('game_id', id)

    if (categoriesError) {
      console.error('Fetch game categories error:', categoriesError)
      return NextResponse.json({ error: categoriesError.message }, { status: 500 })
    }

    const categoryIds = (categories ?? []).map((category: any) => String(category.id))

    if (sellerIds.length === 0 || categoryIds.length === 0) {
      return NextResponse.json({ success: true, assigned: 0, message: 'No sellers or categories to assign' })
    }

    const {
      data: sellerUsers,
      error: sellersError,
    } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'seller')
      .in('id', sellerIds)

    if (sellersError) {
      console.error('Fetch sellers error:', sellersError)
      return NextResponse.json({ error: sellersError.message }, { status: 500 })
    }

    const validSellerIds = Array.from(
      new Set((sellerUsers ?? []).map((seller: any) => String(seller.id)))
    )

    if (validSellerIds.length === 0) {
      return NextResponse.json({ success: true, assigned: 0, message: 'No valid sellers to assign' })
    }

    const {
      data: existingAssignments,
      error: existingError,
    } = await supabase
      .from('seller_categories')
      .select('seller_id, category_id')
      .in('seller_id', validSellerIds)
      .in('category_id', categoryIds)

    if (existingError) {
      console.error('Fetch existing assignments error:', existingError)
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }

    const existingSet = new Set(
      (existingAssignments ?? []).map(
        (assignment: any) => `${assignment.seller_id}:${assignment.category_id}`
      )
    )

    const rowsToInsert = []
    for (const sellerId of validSellerIds) {
      for (const categoryId of categoryIds) {
        const key = `${sellerId}:${categoryId}`
        if (!existingSet.has(key)) {
          rowsToInsert.push({ seller_id: sellerId, category_id: categoryId })
        }
      }
    }

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('seller_categories')
        .insert(rowsToInsert)

      if (insertError) {
        console.error('Assign sellers error:', insertError)
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      assigned: rowsToInsert.length,
      message: 'Sellers assigned to game categories successfully',
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation error', message: error.message }, { status: 400 })
    }

    console.error('Assign sellers to game error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
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

    const { id } = await params
    const body = await request.json()
    const { sellerId } = removeSellerSchema.parse(body)

    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id')
      .eq('id', id)
      .single()

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const {
      data: categories,
      error: categoriesError,
    } = await supabase
      .from('categories')
      .select('id')
      .eq('game_id', id)

    if (categoriesError) {
      console.error('Fetch game categories error:', categoriesError)
      return NextResponse.json({ error: categoriesError.message }, { status: 500 })
    }

    const categoryIds = (categories ?? []).map((category: any) => String(category.id))

    if (categoryIds.length === 0) {
      return NextResponse.json({ success: true, removed: 0, message: 'No categories found for game' })
    }

    const { error: deleteError } = await supabase
      .from('seller_categories')
      .delete()
      .in('category_id', categoryIds)
      .eq('seller_id', sellerId)

    if (deleteError) {
      console.error('Remove seller assignment error:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      removed: 1,
      message: 'Seller removed from game categories successfully',
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation error', message: error.message }, { status: 400 })
    }

    console.error('Remove seller from game error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
