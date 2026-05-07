import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { z } from 'zod'

const sellerApplicationSchema = z.object({
  business_name: z.string().trim().optional(),

  business_description: z
    .string()
    .trim()
    .min(1),

  category_ids: z
    .array(
      z.string().trim().min(1)
    )
    .min(1),
})

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
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const token =
      authHeader.substring(7)

    const auth =
      verifyToken(token)

    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // =====================================================
    // VALIDATE BODY
    // =====================================================

    const body =
      await request.json()

    const payload =
      sellerApplicationSchema.parse(
        body
      )

    // =====================================================
    // USER
    // =====================================================

    const {
      data: user,
      error: userError,
    } = await supabase
      .from('users')
      .select(`
        id,
        role,
        status
      `)
      .eq('id', auth.id)
      .single()

    if (userError || !user) {
      console.error(
        'Seller application user lookup error:',
        userError
      )

      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // =====================================================
    // VALIDATE CATEGORIES
    // =====================================================

    const {
      data: validCategories,
      error: categoriesError,
    } = await supabase
      .from('categories')
      .select(`
        id,
        game_id
      `)
      .in(
        'id',
        payload.category_ids
      )

    if (categoriesError) {
      console.error(
        'Seller application category lookup error:',
        categoriesError
      )

      return NextResponse.json(
        {
          error:
            'Unable to validate selected categories',
        },
        { status: 500 }
      )
    }

    const validCategoryIds =
      (
        validCategories ?? []
      ).map(
        (category: any) =>
          String(category.id)
      )

    if (
      validCategoryIds.length !==
      payload.category_ids.length
    ) {
      return NextResponse.json(
        {
          error:
            'One or more selected categories are invalid',
        },
        { status: 400 }
      )
    }

    // =====================================================
    // FIND EXISTING SELLER
    // =====================================================

    const {
      data: existingSeller,
      error: sellerLookupError,
    } = await supabase
      .from('sellers')
      .select(`
        id,
        user_id
      `)
      .eq('user_id', auth.id)
      .maybeSingle()

    if (sellerLookupError) {
      console.error(
        'Seller lookup error:',
        sellerLookupError
      )

      return NextResponse.json(
        {
          error:
            'Unable to process seller profile',
        },
        { status: 500 }
      )
    }

    let sellerId =
      existingSeller?.id

    // =====================================================
    // CREATE SELLER
    // =====================================================

    if (!sellerId) {
      const {
        data: insertResult,
        error: insertError,
      } = await supabase
        .from('sellers')
        .insert({
          user_id: auth.id,

          business_name:
            payload.business_name ??
            null,

          business_description:
            payload.business_description,
        })
        .select('id')
        .single()

      if (
        insertError ||
        !insertResult
      ) {
        console.error(
          'Seller creation error:',
          insertError
        )

        return NextResponse.json(
          {
            error:
              'Unable to create seller profile',
          },
          { status: 500 }
        )
      }

      sellerId =
        insertResult.id
    } else {
      // =====================================================
      // UPDATE SELLER
      // =====================================================

      const {
        error: updateError,
      } = await supabase
        .from('sellers')
        .update({
          business_name:
            payload.business_name ??
            null,

          business_description:
            payload.business_description,
        })
        .eq('id', sellerId)

      if (updateError) {
        console.error(
          'Seller update error:',
          updateError
        )

        return NextResponse.json(
          {
            error:
              'Unable to update seller profile',
          },
          { status: 500 }
        )
      }
    }

    // =====================================================
    // UPDATE USER ROLE + STATUS
    // =====================================================

    const {
      error: roleUpdateError,
    } = await supabase
      .from('users')
      .update({
        role: 'seller',

        status: 'pending',

        is_verified: false,
      })
      .eq('id', auth.id)

    if (roleUpdateError) {
      console.error(
        'Seller role update error:',
        roleUpdateError
      )

      return NextResponse.json(
        {
          error:
            'Unable to update seller role',
        },
        { status: 500 }
      )
    }

    // =====================================================
    // REMOVE OLD CATEGORY ASSIGNMENTS
    // =====================================================

    const {
      error: deleteError,
    } = await supabase
      .from('seller_categories')
      .delete()
      .eq(
        'seller_id',
        auth.id
      )

    if (deleteError) {
      console.error(
        'Seller category cleanup error:',
        deleteError
      )

      return NextResponse.json(
        {
          error:
            'Unable to update seller categories',
        },
        { status: 500 }
      )
    }

    // =====================================================
    // INSERT CATEGORY ASSIGNMENTS
    // =====================================================

    const assignments =
      payload.category_ids.map(
        (categoryId) => ({
          seller_id: auth.id,

          category_id:
            categoryId,
        })
      )

    const {
      error: assignError,
    } = await supabase
      .from('seller_categories')
      .insert(assignments)

    if (assignError) {
      console.error(
        'Seller category assignment error:',
        assignError
      )

      return NextResponse.json(
        {
          error:
            'Unable to save selected categories',
        },
        { status: 500 }
      )
    }

    // =====================================================
    // SUCCESS
    // =====================================================

    return NextResponse.json({
      success: true,

      message:
        'Seller application submitted for review',
    })
  } catch (error) {
    console.error(
      'Seller application error:',
      error
    )

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

    return NextResponse.json(
      {
        error:
          'Internal server error',
      },
      { status: 500 }
    )
  }
}
