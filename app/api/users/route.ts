import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { z } from 'zod'

const DEBUG_USERS_API = process.env.NODE_ENV !== 'production'

const updateUserSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['customer', 'seller', 'admin']),
  total_points: z.number().finite().min(0),
  is_active: z.boolean(),
  is_verified: z.boolean(),
  seller_fee_percentage: z.number().finite().min(0).max(100).optional(),
  rejection_reason: z.string().min(1).optional(),
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

    const verificationMap = new Map<string, string>()
    const rejectionReasonMap = new Map<string, string | null>()
    const sellerFeeMap = new Map<string, number>()
    const assignedGamesMap = new Map<string, string[]>()

    if (sellerUserIds.length > 0) {
      const { data: sellers, error: sellersError } = await supabase
        .from('sellers')
        .select('id, user_id, verification_status, rejection_reason, fee_percentage')
        .in('user_id', sellerUserIds)

      const sellerIdToUserId = new Map<string, string>()

      if (sellersError) {
        console.error('Seller verification query error:', sellersError)
      } else {
        (sellers ?? []).forEach((seller: any) => {
          sellerIdToUserId.set(seller.id, seller.user_id)
          verificationMap.set(
            seller.user_id,
            seller.verification_status ?? 'pending'
          )
          rejectionReasonMap.set(
            seller.user_id,
            seller.rejection_reason ?? null
          )
          sellerFeeMap.set(seller.user_id, Number(seller.fee_percentage ?? 10))
        })
      }

      const sellerIds = (sellers ?? []).map((seller: any) => seller.id)

      const { data: sellerGames, error: sellerGamesError } = sellerIds.length
        ? await supabase
            .from('seller_games')
            .select('seller_id, game_id')
            .in('seller_id', sellerIds)
        : { data: [], error: null }

      if (sellerGamesError) {
        console.error('Seller games query error:', sellerGamesError)
      } else {
        const gameIds = Array.from(
          new Set((sellerGames ?? []).map((item: any) => item.game_id))
        )

        const { data: gamesData, error: gamesError } = await supabase
          .from('games')
          .select('id, name')
          .in('id', gameIds)

        const gameMap = new Map<string, string>()
        if (!gamesError) {
          (gamesData ?? []).forEach((game: any) => {
            gameMap.set(game.id, game.name)
          })
        }

        ;(sellerGames ?? []).forEach((item: any) => {
          const userId = sellerIdToUserId.get(item.seller_id)
          if (!userId) {
            return
          }

          const games = assignedGamesMap.get(userId) ?? []
          const gameName = gameMap.get(item.game_id)
          if (gameName) {
            games.push(gameName)
          }
          assignedGamesMap.set(userId, games)
        })

        if (DEBUG_USERS_API) {
          console.log('[api/users] seller game mapping', {
            sellerUsersCount: sellerUserIds.length,
            sellersCount: (sellers ?? []).length,
            sellerGamesCount: (sellerGames ?? []).length,
            mappedUsersWithGames: Array.from(assignedGamesMap.entries()).map(
              ([userId, games]) => ({ userId, gamesCount: games.length })
            ),
          })
        }
      }
    }

    const users = usersData.map((user: any) => ({
      ...user,
      total_points: Number(user.points ?? 0),
      is_active: user.is_active ?? true,
      is_verified: user.is_verified ?? false,
      verification_status:
        user.role === 'seller'
          ? verificationMap.get(user.id) || 'pending'
          : undefined,
      rejection_reason:
        user.role === 'seller'
          ? rejectionReasonMap.get(user.id) ?? null
          : null,
      seller_fee_percentage:
        user.role === 'seller'
          ? sellerFeeMap.get(user.id) ?? 10
          : undefined,
      assigned_games: assignedGamesMap.get(user.id) ?? [],
      selected_games: assignedGamesMap.get(user.id) ?? [],
    }))

    if (DEBUG_USERS_API) {
      console.log(
        '[api/users] sellers payload snapshot',
        users
          .filter((u: any) => u.role === 'seller')
          .map((u: any) => ({
            id: u.id,
            username: u.username,
            assigned_games: u.assigned_games,
            selected_games: u.selected_games,
          }))
      )
    }

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
            : typeof error === 'string'
            ? error
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

    const { data: existingUser, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', payload.id)
      .single()

    if (userError || !existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (payload.id === auth.id) {
      if (payload.role !== existingUser.role) {
        return NextResponse.json(
          { error: 'Admins cannot change their own role' },
          { status: 400 }
        )
      }

      if ('is_active' in existingUser && payload.is_active !== (existingUser.is_active ?? true)) {
        return NextResponse.json(
          { error: 'Admins cannot deactivate their own account' },
          { status: 400 }
        )
      }
    }

    if (payload.role === 'seller' && !payload.is_verified && !payload.rejection_reason) {
      return NextResponse.json(
        {
          error: 'Rejection reason is required when rejecting a seller',
        },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}

    if ('role' in existingUser) {
      updateData.role = payload.role
    }

    if ('points' in existingUser) {
      updateData.points = payload.total_points
    }

    if ('balance' in existingUser) {
      updateData.balance = payload.total_points
    }

    if ('is_active' in existingUser) {
      updateData.is_active = payload.is_active
    }

    if ('is_verified' in existingUser) {
      updateData.is_verified = payload.is_verified
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No editable fields found for this user' },
        { status: 400 }
      )
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', payload.id)
      .select('*')
      .single()

    if (updateError || !updatedUser) {
      console.error('Update user error:', updateError)
      return NextResponse.json(
        { error: updateError?.message ?? 'Unable to update user' },
        { status: 500 }
      )
    }

    if (payload.role === 'seller') {
      const verificationStatus = payload.is_verified ? 'verified' : 'rejected'
      const sellerUpdateData: Record<string, unknown> = {
        verification_status: verificationStatus,
        fee_percentage: payload.seller_fee_percentage ?? 10,
      }

      if (payload.is_verified) {
        sellerUpdateData.rejection_reason = null
      } else if (payload.rejection_reason) {
        sellerUpdateData.rejection_reason = payload.rejection_reason
      }

      const { error: sellerUpdateError } = await supabase
        .from('sellers')
        .update(sellerUpdateData)
        .eq('user_id', payload.id)

      if (sellerUpdateError) {
        console.error('Update seller verification status error:', sellerUpdateError)
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        ...updatedUser,
        total_points: Number(updatedUser.points ?? updatedUser.balance ?? 0),
        is_active: updatedUser.is_active ?? true,
        is_verified: updatedUser.is_verified ?? false,
        seller_fee_percentage:
          payload.role === 'seller' ? payload.seller_fee_percentage ?? 10 : undefined,
      },
    })
  } catch (error) {
    console.error('Update user error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : typeof error === 'string'
            ? error
            : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
