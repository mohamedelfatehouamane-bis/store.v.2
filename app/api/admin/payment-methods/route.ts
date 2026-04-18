import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

const createPaymentMethodSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9_-]+$/, 'Name must contain only lowercase letters, numbers, _ or -'),
  display_name: z.string().trim().min(1).max(120),
  instructions: z.string().trim().min(10).max(4000),
  is_active: z.boolean().optional().default(true),
})

function requireAdmin(request: NextRequest): { error: NextResponse | null } {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const token = authHeader.substring(7)
  const auth = verifyToken(token)

  if (!auth || auth.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Only admins can manage payment methods' }, { status: 403 }) }
  }

  if (!supabaseAdmin) {
    return {
      error: NextResponse.json(
        { error: 'Server misconfiguration', message: 'Payment methods service is not configured' },
        { status: 500 }
      ),
    }
  }

  return { error: null }
}

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = requireAdmin(request)
    if (authError) {
      return authError
    }

    const { data: methods, error: methodsError } = await supabaseAdmin!
      .from('payment_methods')
      .select('id, name, display_name, instructions, is_active, created_at')
      .order('created_at', { ascending: true })

    if (methodsError) {
      console.error('Admin payment methods query error:', methodsError)
      return NextResponse.json({ error: methodsError.message }, { status: 500 })
    }

    const withPriority = await supabaseAdmin!
      .from('payment_method_accounts')
      .select('id, payment_method_id, account_number, account_name, is_active, usage_count, priority, last_used, created_at')
      .order('created_at', { ascending: true })

    const fallback = withPriority.error?.code === '42703'
      ? await supabaseAdmin!
          .from('payment_method_accounts')
          .select('id, payment_method_id, account_number, account_name, is_active, usage_count, last_used, created_at')
          .order('created_at', { ascending: true })
      : withPriority

    const { data: accounts, error: accountsError } = fallback

    if (accountsError) {
      console.error('Admin payment method accounts query error:', accountsError)
      return NextResponse.json({ error: accountsError.message }, { status: 500 })
    }

    const paymentMethods = (methods ?? []).map((method: any) => ({
      ...method,
      accounts: (accounts ?? []).filter((account: any) => account.payment_method_id === method.id),
    }))

    return NextResponse.json({ paymentMethods })
  } catch (error) {
    console.error('Admin payment methods GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error: authError } = requireAdmin(request)
    if (authError) {
      return authError
    }

    const body = await request.json()
    const payload = createPaymentMethodSchema.parse(body)

    const { data, error } = await supabaseAdmin!
      .from('payment_methods')
      .insert({
        name: payload.name,
        display_name: payload.display_name,
        instructions: payload.instructions,
        is_active: payload.is_active,
      })
      .select('id, name, display_name, instructions, is_active, created_at')
      .single()

    if (error || !data) {
      if (error?.code === '23505') {
        return NextResponse.json({ error: 'Payment method name already exists' }, { status: 409 })
      }

      return NextResponse.json(
        { error: error?.message ?? 'Unable to create payment method' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, paymentMethod: { ...data, accounts: [] } }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Admin payment method POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
