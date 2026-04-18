import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { telegramService } from '@/lib/telegram-service'
import { z } from 'zod'

const approvalSchema = z.object({
  transaction_id: z.string().trim().max(255).optional(),
  admin_notes: z.string().trim().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth || auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can approve top-up requests' },
        { status: 403 }
      )
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server misconfiguration', message: 'Admin top-up service is not configured' },
        { status: 500 }
      )
    }

    const adminClient = supabaseAdmin

    const body = await request.json()
    const payload = approvalSchema.parse(body)

    const { data: topup, error: topupError } = await adminClient
      .from('point_topups')
      .update({ status: 'processing' })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id, user_id, amount_points, status')
      .maybeSingle()

    if (topupError) {
      console.error('Top-up claim error:', topupError)
      return NextResponse.json(
        { error: topupError.message ?? 'Unable to process top-up request' },
        { status: 500 }
      )
    }

    if (!topup) {
      return NextResponse.json(
        { error: 'Only pending top-up requests can be approved' },
        { status: 400 }
      )
    }

    const rollbackToPending = async () => {
      const { error: rollbackError } = await adminClient
        .from('point_topups')
        .update({ status: 'pending' })
        .eq('id', id)
        .eq('status', 'processing')

      if (rollbackError) {
        console.error('Top-up rollback error:', rollbackError)
      }
    }

    const topupPayload = topup

    const amountPoints = Number(topupPayload.amount_points ?? 0)
    if (!Number.isInteger(amountPoints) || amountPoints <= 0) {
      return NextResponse.json(
        { error: 'Invalid top-up amount' },
        { status: 400 }
      )
    }

    const { data: topupUser, error: topupUserError } = await adminClient
      .from('users')
      .select('id, points, telegram_id')
      .eq('id', topupPayload.user_id)
      .single()

    if (topupUserError || !topupUser) {
      await rollbackToPending()
      return NextResponse.json(
        { error: 'Top-up user not found' },
        { status: 404 }
      )
    }

    const currentPoints = Number(topupUser.points ?? 0)
    const updatedPoints = currentPoints + amountPoints

    const { error: userUpdateError } = await adminClient
      .from('users')
      .update({ points: updatedPoints })
      .eq('id', topupUser.id)

    if (userUpdateError) {
      await rollbackToPending()
      console.error('Top-up user points update error:', userUpdateError)
      return NextResponse.json(
        { error: userUpdateError.message ?? 'Unable to update user points' },
        { status: 500 }
      )
    }

    let transactionUpdateResult = await adminClient
      .from('point_transactions')
      .update({ status: 'approved' })
      .eq('reference_id', topupPayload.id)

    if (transactionUpdateResult.error?.code === '42703') {
      transactionUpdateResult = { error: null } as any
    }

    if (transactionUpdateResult.error) {
      await rollbackToPending()
      console.error('Top-up transaction update error:', transactionUpdateResult.error)
      return NextResponse.json(
        { error: transactionUpdateResult.error.message ?? 'Unable to update top-up transaction' },
        { status: 500 }
      )
    }

    const { error: topupUpdateError } = await adminClient
      .from('point_topups')
      .update({ status: 'approved' })
      .eq('id', topupPayload.id)
      .eq('status', 'processing')

    if (topupUpdateError) {
      await rollbackToPending()
      console.error('Top-up approval update error:', topupUpdateError)
      return NextResponse.json(
        { error: topupUpdateError.message ?? 'Unable to finalize top-up approval' },
        { status: 500 }
      )
    }

    const userTelegramId = (topupUser as any)?.telegram_id
    if (userTelegramId) {
      void telegramService.sendMessage(
        String(userTelegramId),
        telegramService.pointsTransactionMessage(amountPoints, updatedPoints)
      ).catch((err) => {
        console.warn('[TopUp][Approve] Telegram user notify failed:', err instanceof Error ? err.message : String(err))
      })
    } else {
      console.warn('[TopUp][Approve] telegram_id is missing; skipping Telegram user notification', {
        userId: topupUser.id,
        topupId: id,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Top-up request approved successfully',
      topup_id: id,
      points_added: amountPoints,
      previous_points: currentPoints,
      current_points: updatedPoints,
      transaction_id: payload.transaction_id ?? null,
      admin_notes: payload.admin_notes ?? null,
    })
  } catch (error) {
    console.error('Approve top-up request error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
