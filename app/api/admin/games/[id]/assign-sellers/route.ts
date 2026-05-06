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
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
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

    const sellerIds = Array.from(
      new Set(parsed.sellerIds)
    )

    // Validate category exists
    const { data: category, error: categoryError } =
      await supabase
        .from('categories')
        .select('id')
        .eq('id', id)
        .single()

    if (categoryError || !category) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      )
    }

    // Validate seller users
    const { data: sellerUsers, error: sellersError } =
      sellerIds.length
        ? await supabase
            .from('users')
            .select('id')
            .eq('role', 'seller')
            .in('id', sellerIds)
        : { data: [], error: null }

    if (sellersError) {
      console.error(
        'Fetch sellers error:',
        sellersError
      )

      return NextResponse.json(
        { error: sellersError.message },
        { status: 500 }
      )
    }

    const validSellerIds = Array.from(
      new Set(
        (sellerUsers ?? []).map((seller: any) =>
          String(seller.id)
        )
      )
    )

    // Existing assignments
    const {
      data: existingAssignments,
      error: existingError,
    } = await supabase
      .from('seller_categories')
      .select('seller_id')
      .eq('category_id', id)

    if (existingError) {
      console.error(
        'Fetch assignments error:',
        existingError
      )

      return NextResponse.json(
        { error: existingError.message },
        { status: 500 }
      )
    }

    const alreadyAssigned = new Set(
      (existingAssignments ?? []).map((row: any) =>
        String(row.seller_id)
      )
    )

    const rowsToInsert = validSellerIds
      .filter(
        (sellerId) =>
          !alreadyAssigned.has(sellerId)
      )
      .map((sellerId) => ({
        category_id: id,
        seller_id: sellerId,
      }))

    if (rowsToInsert.length > 0) {
      const { error: insertError } =
        await supabase
          .from('seller_categories')
          .insert(rowsToInsert)

      if (insertError) {
        console.error(
          'Assign sellers error:',
          insertError
        )

        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      assigned: rowsToInsert.length,
      message:
        'Sellers assigned to category successfully',
    })
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

    console.error('Assign sellers error:', error)

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
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

    const { sellerId } =
      removeSellerSchema.parse(body)

    const { error } = await supabase
      .from('seller_categories')
      .delete()
      .eq('category_id', id)
      .eq('seller_id', sellerId)

    if (error) {
      console.error(
        'Remove seller assignment error:',
        error
      )

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message:
        'Seller removed from category successfully',
    })
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

    console.error(
      'Remove seller assignment error:',
      error
    )

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
