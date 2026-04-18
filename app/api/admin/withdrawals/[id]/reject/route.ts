import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { z } from 'zod'

const rejectSchema = z.object({
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
        { error: 'Only admins can reject withdrawal requests' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const payload = rejectSchema.parse(body)

    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (withdrawalError || !withdrawal) {
      console.error('Withdrawal request lookup error:', withdrawalError)
      return NextResponse.json({ error: 'Withdrawal request not found' }, { status: 404 })
    }

    if (withdrawal.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending withdrawal requests can be rejected' },
        { status: 400 }
      )
    }

    const { error: requestUpdateError } = await supabase
      .from('withdrawal_requests')
      .update({
        status: 'rejected',
        processed_by: auth.id,
        processed_at: new Date().toISOString(),
        admin_notes: payload.admin_notes ?? null,
      })
      .eq('id', id)

    if (requestUpdateError) {
      console.error('Withdrawal request rejection error:', requestUpdateError)
      return NextResponse.json(
        { error: requestUpdateError.message ?? 'Unable to reject withdrawal request' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Withdrawal request rejected successfully',
      withdrawal_id: id,
    })
  } catch (error) {
    console.error('Reject withdrawal request error:', error)
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
