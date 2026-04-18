import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(50).regex(/^[a-z0-9_-]+$/, 'Name must contain only lowercase letters, numbers, _ or -').optional(),
    display_name: z.string().trim().min(1).max(120).optional(),
    instructions: z.string().trim().min(10).max(4000).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  })

export async function PATCH(
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
      return NextResponse.json({ error: 'Only admins can update payment methods' }, { status: 403 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server misconfiguration', message: 'Payment methods service is not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const payload = patchSchema.parse(body)

    const updatePayload: Record<string, string | boolean> = {}
    if (payload.name !== undefined) {
      updatePayload.name = payload.name
    }
    if (payload.display_name !== undefined) {
      updatePayload.display_name = payload.display_name
    }
    if (payload.instructions !== undefined) {
      updatePayload.instructions = payload.instructions
    }
    if (payload.is_active !== undefined) {
      updatePayload.is_active = payload.is_active
    }

    const { data, error } = await supabaseAdmin
      .from('payment_methods')
      .update(updatePayload)
      .eq('id', id)
      .select('id, name, display_name, instructions, is_active, created_at')
      .single()

    if (error || !data) {
      if (error?.code === '23505') {
        return NextResponse.json(
          { error: 'Payment method name already exists' },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { error: error?.message ?? 'Unable to update payment method' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, paymentMethod: data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Admin payment method PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
