import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
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
        { error: 'Only admins can approve withdrawal requests' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const payload = approvalSchema.parse(body)

    const { data, error: rpcError } = await supabase.rpc('approve_withdrawal_request', {
      request_id: id,
      admin_id: auth.id,
      transaction_id: payload.transaction_id ?? null,
      admin_notes: payload.admin_notes ?? null,
    })

    if (rpcError) {
      console.error('Approve withdrawal RPC error:', rpcError)
      return NextResponse.json(
        { error: rpcError.message ?? 'Unable to approve withdrawal request' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      ...(data ?? {}),
      message: 'Withdrawal request approved successfully',
    })
  } catch (error) {
    console.error('Approve withdrawal request error:', error)
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
