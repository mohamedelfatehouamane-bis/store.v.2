import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { z } from 'zod'

const DEBUG_USERS_API = process.env.NODE_ENV !== 'production'

const updateUserSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['customer', 'seller', 'admin']),
  total_points: z.number().finite().min(0),
  is_active: z.boolean(),
  status: z.enum(['pending', 'approved', 'rejected']),
  seller_fee_percentage: z.number().finite().min(0).max(100).optional(),
  rejection_reason: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth || auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can access users' },
        { status: 403 }
      )
    }

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('Supabase users query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const usersData = (data ?? []) as any[]

    const sellerUserIds = usersData
      .filter((user) => user.role === 'seller')
      .map((user) => user.id)

    const sellerFeeMap = new Map<string, number>()
    const rejectionReasonMap = new Map<string, string | null>()
    const assignedCategoriesMap = new Map<string, string[]>()

    if (sellerUserIds.length > 0) {
      const { data: sellers, error: sellersError } = await supabase
        .from('sellers')
        .select('id, user_id, fee_percentage, rejection_reason')
        .in('user_id', sellerUserIds)

      const sellerIdToUserId = new Map<string, string>()

      if (sellersError) {
        console.error('Seller query error:', sellersError)
      } else {
        ;(sellers ?? []).forEach((seller: any) => {
          sellerIdToUserId.set(seller.id, seller.user_id)

          sellerFeeMap.set(
            seller.user_id,
            Number(seller.fee_percentage ?? 10)
          )

          rejectionReasonMap.set(
            seller.user_id,
            seller.rejection_reason ?? null
          )
        })
      }

      const sellerIds = (sellers ?? []).map((seller: any) => seller.id)

      const { data: sellerCategories, error: sellerCategoriesError } =
        sellerIds.length
          ? await supabase
              .from('seller_categories')
              .select('seller_id, category_id')
              .in('seller_id', sellerIds)
          : { data: [], error: null }

      if (sellerCategoriesError) {
        console.error(
          'Seller categories query error:',
          sellerCategoriesError
        )
      } else {
        const categoryIds = Array.from(
          new Set(
            (sellerCategories ?? []).map(
              (item: any) => item.category_id
            )
          )
        )

        const { data: categoriesData, error: categoriesError } =
          await supabase
            .from('categories')
            .select('id, name')
            .in('id', categoryIds)

        const categoryMap = new Map<string, string>()

        if (!categoriesError) {
          ;(categoriesData ?? []).forEach((category: any) => {
            categoryMap.set(category.id, category.name)
          })
        }

        ;(sellerCategories ?? []).forEach((item: any) => {
          const userId = sellerIdToUserId.get(item.seller_id)

          if (!userId) return

          const categories =
            assignedCategoriesMap.get(userId) ?? []

          const categoryName = categoryMap.get(item.category_id)

          if (categoryName) {
            categories.push(categoryName)
          }

          assignedCategoriesMap.set(userId, categories)
        })

        if (DEBUG_USERS_API) {
          console.log('[api/users] seller category mapping', {
            sellerUsersCount: sellerUserIds.length,
            sellerCategoriesCount:
              (sellerCategories ?? []).length,
          })
        }
      }
    }

    const users = usersData.map((user: any) => ({
      ...user,

      total_points: Number(
        user.points ?? user.balance ?? 0
      ),

      is_active: user.is_active ?? true,

      status:
        user.role === 'seller'
          ? user.status ?? 'pending'
          : undefined,

      rejection_reason:
        user.role === 'seller'
          ? rejectionReasonMap.get(user.id) ?? null
          : null,

      seller_fee_percentage:
        user.role === 'seller'
          ? sellerFeeMap.get(user.id) ?? 10
          : undefined,

      assigned_categories:
        assignedCategoriesMap.get(user.id) ?? [],

      selected_categories:
        assignedCategoriesMap.get(user.id) ?? [],
    }))

    return NextResponse.json({
      success: true,
      users,
    })
  } catch (error) {
    console.error('Get users error:', error)

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

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth || auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can update users' },
        { status: 403 }
      )
    }

    const body = await request.json()

    const payload = updateUserSchema.parse(body)

    const { data: existingUser, error: userError } =
      await supabase
        .from('users')
        .select('*')
        .eq('id', payload.id)
        .single()

    if (userError || !existingUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const updateData: Record<string, unknown> = {
      role: payload.role,
      points: payload.total_points,
      is_active: payload.is_active,
    }

    if (payload.role === 'seller') {
      updateData.status = payload.status
    }

    const { data: updatedUser, error: updateError } =
      await supabase
        .from('users')
        .update(updateData)
        .eq('id', payload.id)
        .select('*')
        .single()

    if (updateError || !updatedUser) {
      console.error('Update user error:', updateError)

      return NextResponse.json(
        {
          error:
            updateError?.message ??
            'Unable to update user',
        },
        { status: 500 }
      )
    }

    if (payload.role === 'seller') {
      const sellerUpdateData: Record<string, unknown> = {
        fee_percentage:
          payload.seller_fee_percentage ?? 10,

        rejection_reason:
          payload.status === 'rejected'
            ? payload.rejection_reason ?? null
            : null,
      }

      const { error: sellerUpdateError } =
        await supabase
          .from('sellers')
          .update(sellerUpdateData)
          .eq('user_id', payload.id)

      if (sellerUpdateError) {
        console.error(
          'Seller update error:',
          sellerUpdateError
        )
      }
    }

    return NextResponse.json({
      success: true,

      user: {
        ...updatedUser,

        total_points: Number(
          updatedUser.points ??
            updatedUser.balance ??
            0
        ),
      },
    })
  } catch (error) {
    console.error('Update user error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: error.errors,
        },
        { status: 400 }
      )
    }

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
