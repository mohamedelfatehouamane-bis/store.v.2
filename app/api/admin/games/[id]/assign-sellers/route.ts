import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { z } from 'zod'

const assignSellersSchema = z.object({
  sellerIds: z.array(z.union([z.string(), z.number()])).default([]),
})

const removeSellerSchema = z.object({
  sellerId: z.union([z.string(), z.number()]),
})

async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const token = authHeader.substring(7)
  const auth = verifyToken(token)

  if (!auth || auth.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Only admins can manage seller assignments' }, { status: 403 }) }
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
    const sellerIds = Array.from(new Set(parsed.sellerIds.map((value) => String(value))))

    const { data: game, error: gameError } = await supabase.from('games').select('id').eq('id', id).single()
    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const { data: sellerUsers, error: sellersError } = sellerIds.length
      ? await supabase
          .from('users')
          .select('id')
          .eq('role', 'seller')
          .in('id', sellerIds)
      : { data: [], error: null }

    if (sellersError) {
      console.error('Fetch sellers error:', sellersError)
      return NextResponse.json({ error: sellersError.message }, { status: 500 })
    }

    const validSellerUserIds = Array.from(
      new Set((sellerUsers ?? []).map((seller: any) => String(seller.id)))
    )

    const { data: existingSellerRows, error: existingSellerRowsError } = validSellerUserIds.length
      ? await supabase
          .from('sellers')
          .select('id, user_id')
          .in('user_id', validSellerUserIds)
      : { data: [], error: null }

    if (existingSellerRowsError) {
      console.error('Fetch seller profiles error:', existingSellerRowsError)
      return NextResponse.json({ error: existingSellerRowsError.message }, { status: 500 })
    }

    const userIdToSellerId = new Map<string, string>()
    ;(existingSellerRows ?? []).forEach((row: any) => {
      userIdToSellerId.set(String(row.user_id), String(row.id))
    })

    const missingSellerUserIds = validSellerUserIds.filter(
      (userId) => !userIdToSellerId.has(userId)
    )

    if (missingSellerUserIds.length > 0) {
      const rowsToCreate = missingSellerUserIds.map((userId) => ({
        user_id: userId,
        verification_status: 'pending',
      }))

      const { data: createdSellerRows, error: createSellerRowsError } = await supabase
        .from('sellers')
        .insert(rowsToCreate)
        .select('id, user_id')

      if (createSellerRowsError) {
        console.error('Create seller profiles error:', createSellerRowsError)
        return NextResponse.json({ error: createSellerRowsError.message }, { status: 500 })
      }

      ;(createdSellerRows ?? []).forEach((row: any) => {
        userIdToSellerId.set(String(row.user_id), String(row.id))
      })
    }

    const { data: existingAssignments, error: existingError } = await supabase
      .from('seller_games')
      .select('seller_id')
      .eq('game_id', id)

    if (existingError) {
      console.error('Fetch assignments error:', existingError)
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }

    const alreadyAssigned = new Set((existingAssignments ?? []).map((row: any) => String(row.seller_id)))
    const rowsToInsert = validSellerUserIds
      .map((userId) => userIdToSellerId.get(userId))
      .filter((sellerId): sellerId is string => Boolean(sellerId) && !alreadyAssigned.has(String(sellerId)))
      .map((sellerId) => ({
        game_id: id,
        seller_id: sellerId,
      }))

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase.from('seller_games').insert(rowsToInsert)
      if (insertError) {
        console.error('Assign sellers error:', insertError)
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      assigned: rowsToInsert.length,
      message: 'Sellers assigned successfully',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 })
    }

    console.error('Assign sellers error:', error)
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

    const { data: sellerRow, error: sellerLookupError } = await supabase
      .from('sellers')
      .select('id')
      .eq('user_id', String(sellerId))
      .maybeSingle()

    if (sellerLookupError) {
      console.error('Lookup seller profile error:', sellerLookupError)
      return NextResponse.json({ error: sellerLookupError.message }, { status: 500 })
    }

    if (!sellerRow?.id) {
      return NextResponse.json({ error: 'Seller profile not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('seller_games')
      .delete()
      .eq('game_id', id)
      .eq('seller_id', String(sellerRow.id))

    if (error) {
      console.error('Remove seller assignment error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Seller removed from game',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 })
    }

    console.error('Remove seller assignment error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
