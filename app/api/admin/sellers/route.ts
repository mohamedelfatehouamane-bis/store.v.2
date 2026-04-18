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
      return NextResponse.json({ error: 'Only admins can view sellers' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, username, email')
      .eq('role', 'seller')
      .order('username', { ascending: true })

    if (error) {
      console.error('Get admin sellers error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      sellers: (data ?? []).map((seller: any) => ({
        id: String(seller.id),
        username: seller.username,
        email: seller.email,
      })),
    })
  } catch (error) {
    console.error('Get admin sellers error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
