import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as supabase, supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { z } from 'zod'

const updateStatusSchema = z.object({
  status: z.enum(['approved', 'rejected']),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth || auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can update withdrawal status' },
        { status: 403 }
      )
    }

    const withdrawalId = params.id
    if (!withdrawalId) {
      return NextResponse.json({ error: 'Withdrawal ID is required' }, { status: 400 })
    }

    const body = await request.json()
    const { status } = updateStatusSchema.parse(body)

    const db = supabaseAdmin ?? supabase

    // Fetch the withdrawal record first
    const { data: withdrawal, error: fetchError } = await db
      .from('withdrawals')
      .select('*')
      .eq('id', withdrawalId)
      .single()

    if (fetchError || !withdrawal) {
      return NextResponse.json({ error: 'Withdrawal request not found' }, { status: 404 })
    }

    if (withdrawal.status !== 'pending') {
      return NextResponse.json(
        { error: `Withdrawal has already been ${withdrawal.status}` },
        { status: 409 }
      )
    }

    // Update the withdrawal status
    const { data: updated, error: updateError } = await db
      .from('withdrawals')
      .update({ status })
      .eq('id', withdrawalId)
      .select('*')
      .single()

    if (updateError || !updated) {
      console.error('Update withdrawal status error:', updateError)
      return NextResponse.json(
        { error: updateError?.message ?? 'Unable to update withdrawal status' },
        { status: 500 }
      )
    }

    // If rejected, refund the deducted amount back to seller's balance
    if (status === 'rejected') {
      const sellerId = withdrawal.seller_id
      const amountRequested = Number(withdrawal.amount_requested ?? 0)

      if (sellerId && amountRequested > 0) {
        const { data: sellerUser } = await db
          .from('users')
          .select('id, points')
          .eq('id', sellerId)
          .maybeSingle()

        if (sellerUser) {
          const currentPoints = Number((sellerUser as any).points ?? 0)
          const { error: refundError } = await db
            .from('users')
            .update({ points: currentPoints + amountRequested })
            .eq('id', sellerId)

          if (refundError) {
            console.error('Refund balance error:', refundError)
            // Log but don't fail – admin should be aware
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      withdrawal: {
        id: updated.id,
        seller_id: updated.seller_id,
        amount_requested: Number(updated.amount_requested ?? 0),
        fee_percentage: Number(updated.fee_percentage ?? 0),
        final_amount: Number(updated.final_amount ?? updated.amount_requested ?? 0),
        payment_name: updated.payment_name ?? null,
        status: updated.status,
        created_at: updated.created_at,
      },
      message: `Withdrawal ${status === 'approved' ? 'approved' : 'rejected'} successfully`,
    })
  } catch (error) {
    console.error('Update withdrawal status error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid status value. Use "approved" or "rejected".' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
