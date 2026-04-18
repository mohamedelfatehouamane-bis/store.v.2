import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

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
        { error: 'Only admins can view top-up requests' },
        { status: 403 }
      )
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server misconfiguration', message: 'Admin top-up service is not configured' },
        { status: 500 }
      )
    }

    const url = new URL(request.url)
    const status = url.searchParams.get('status')

    const withAllColumns = await supabaseAdmin
      .from('point_topups')
      .select('id, user_id, amount_points, proof_image, status, created_at, payment_method, payment_account_name, payment_account_number, transaction_reference, rejection_reason, users:user_id(username, email)')
      .order('created_at', { ascending: false })

    const withMethodColumns = withAllColumns.error?.code === '42703'
      ? await supabaseAdmin
          .from('point_topups')
          .select('id, user_id, amount_points, proof_image, status, created_at, payment_method, transaction_reference, users:user_id(username, email)')
          .order('created_at', { ascending: false })
      : withAllColumns

    const fallback = withMethodColumns.error?.code === '42703'
      ? await supabaseAdmin
          .from('point_topups')
          .select('id, user_id, amount_points, proof_image, status, created_at, users:user_id(username, email)')
          .order('created_at', { ascending: false })
      : withMethodColumns

    const { data, error } = fallback

    if (error) {
      console.error('Get admin top-up requests error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const topups = (data ?? []).filter((topup: any) => {
      return status ? topup.status === status : true
    })

    return NextResponse.json({ success: true, topups })
  } catch (error) {
    console.error('Get admin top-up requests error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
