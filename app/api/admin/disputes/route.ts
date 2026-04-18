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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin
      .from('disputes')
      .select(
        `id, order_id, reason, status, previous_status, admin_note, created_at, updated_at, opened_by(username)`
      )
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Fetch disputes error:', error)
      return NextResponse.json({ error: 'Unable to load disputes' }, { status: 500 })
    }

    return NextResponse.json({ success: true, disputes: data ?? [] })
  } catch (error) {
    console.error('Admin disputes route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
