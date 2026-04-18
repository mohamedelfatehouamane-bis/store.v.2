import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
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
      .from('withdrawal_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) {
      queryBuilder = queryBuilder.eq('status', status)
    }

    const { data, error } = await queryBuilder

    if (error) {
      console.error('Get admin withdrawal requests error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, withdrawals: data ?? [] })
  } catch (error) {
    console.error('Get admin withdrawal requests error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
