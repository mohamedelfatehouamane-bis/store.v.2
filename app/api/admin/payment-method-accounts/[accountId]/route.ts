import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

const updateAccountSchema = z
  .object({
    account_number: z.string().trim().min(3).max(120).optional(),
    account_name: z.string().trim().min(2).max(120).optional(),
    is_active: z.boolean().optional(),
    priority: z.number().int().min(1).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  })

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const { accountId } = await params
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can update payment accounts' }, { status: 403 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server misconfiguration', message: 'Payment account service is not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const payload = updateAccountSchema.parse(body)

    const updatePayload: Record<string, string | boolean | number> = {}
    if (payload.account_name !== undefined) updatePayload.account_name = payload.account_name
    if (payload.account_number !== undefined) updatePayload.account_number = payload.account_number
    if (payload.is_active !== undefined) updatePayload.is_active = payload.is_active
    if (payload.priority !== undefined) updatePayload.priority = payload.priority

    let result = await supabaseAdmin
      .from('payment_method_accounts')
      .update(updatePayload)
      .eq('id', accountId)
      .select('id, payment_method_id, account_number, account_name, is_active, usage_count, priority, created_at')
      .single()

    if (result.error?.code === '42703') {
      const { priority, ...fallbackPayload } = updatePayload
      result = await supabaseAdmin
        .from('payment_method_accounts')
        .update(fallbackPayload)
        .eq('id', accountId)
        .select('id, payment_method_id, account_number, account_name, is_active, usage_count, created_at')
        .single()
    }

    if (result.error || !result.data) {
      return NextResponse.json(
        { error: result.error?.message ?? 'Unable to update payment account' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, account: result.data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Update payment account error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const { accountId } = await params
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can remove payment accounts' }, { status: 403 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server misconfiguration', message: 'Payment account service is not configured' },
        { status: 500 }
      )
    }

    const { error } = await supabaseAdmin
      .from('payment_method_accounts')
      .delete()
      .eq('id', accountId)

    if (error) {
      return NextResponse.json(
        { error: error.message ?? 'Unable to remove payment account' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete payment account error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
