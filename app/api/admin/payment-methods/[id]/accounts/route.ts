import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

const createAccountSchema = z.object({
  account_number: z.string().trim().min(3).max(120),
  account_name: z.string().trim().min(2).max(120),
  is_active: z.boolean().optional(),
  priority: z.number().int().min(1).max(100).optional(),
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
      return NextResponse.json({ error: 'Only admins can add payment accounts' }, { status: 403 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server misconfiguration', message: 'Payment account service is not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const payload = createAccountSchema.parse(body)

    const insertPayload: Record<string, unknown> = {
      payment_method_id: id,
      account_number: payload.account_number,
      account_name: payload.account_name,
      is_active: payload.is_active ?? true,
      priority: payload.priority ?? 1,
    }

    let result = await supabaseAdmin
      .from('payment_method_accounts')
      .insert(insertPayload)
      .select('id, payment_method_id, account_number, account_name, is_active, usage_count, priority, created_at')
      .single()

    if (result.error?.code === '42703') {
      const fallbackPayload = {
        payment_method_id: id,
        account_number: payload.account_number,
        account_name: payload.account_name,
        is_active: payload.is_active ?? true,
      }

      result = await supabaseAdmin
        .from('payment_method_accounts')
        .insert(fallbackPayload)
        .select('id, payment_method_id, account_number, account_name, is_active, usage_count, created_at')
        .single()
    }

    if (result.error || !result.data) {
      return NextResponse.json(
        { error: result.error?.message ?? 'Unable to add payment account' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, account: result.data }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Create payment account error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
