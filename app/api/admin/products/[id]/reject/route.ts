import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { status: 401 as const, error: 'Unauthorized: missing token' }
  }

  const auth = verifyToken(authHeader.substring(7))
  if (!auth) {
    return { status: 401 as const, error: 'Unauthorized: invalid token' }
  }

  if (auth.role !== 'admin') {
    return { status: 403 as const, error: 'Forbidden: admin role required' }
  }

  return { status: 200 as const, auth }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = getAuth(request)
    if (authResult.status !== 200) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('products')
      .update({ status: 'rejected', approved_by: authResult.auth.id, approved_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
      .select('*')
      .single()

    if (error) {
      console.error('Reject product error:', error)
      return NextResponse.json({ error: error.message || 'Unable to reject product' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Product not found or not pending' }, { status: 404 })
    }

    return NextResponse.json({ success: true, product: data })
  } catch (error) {
    console.error('Reject product unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
