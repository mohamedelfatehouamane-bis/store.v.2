import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as supabase } from '@/lib/db'
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
        { error: 'Only admins can view withdrawal requests' },
        { status: 403 }
      )
    }

    const url = new URL(request.url)
    const status = url.searchParams.get('status')

    let queryBuilder = supabase
      .from('withdrawals')
      .select('*, users(id, username, email)')
      .order('created_at', { ascending: false })

    if (status) {
      queryBuilder = queryBuilder.eq('status', status)
    }

    const { data, error } = await queryBuilder

    if (error) {
      // Fall back to query without join if users relation is unavailable
      if (error.code === 'PGRST200' || error.code === '42P01') {
        let fallbackQuery = supabase
          .from('withdrawals')
          .select('*')
          .order('created_at', { ascending: false })

        if (status) {
          fallbackQuery = fallbackQuery.eq('status', status)
        }

        const { data: fallbackData, error: fallbackError } = await fallbackQuery

        if (fallbackError) {
          console.error('Get admin withdrawal requests error:', fallbackError)
          return NextResponse.json({ error: fallbackError.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, withdrawals: fallbackData ?? [] })
      }

      console.error('Get admin withdrawal requests error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const withdrawals = (data ?? []).map((row: any) => ({
      id: row.id,
      seller_id: row.seller_id,
      seller_username: row.users?.username ?? null,
      seller_email: row.users?.email ?? null,
      amount_requested: Number(row.amount_requested ?? 0),
      fee_percentage: Number(row.fee_percentage ?? 0),
      final_amount: Number(row.final_amount ?? row.amount_requested ?? 0),
      payment_name: row.payment_name ?? null,
      status: row.status,
      created_at: row.created_at,
    }))

    return NextResponse.json({ success: true, withdrawals })
  } catch (error) {
    console.error('Get admin withdrawal requests error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
