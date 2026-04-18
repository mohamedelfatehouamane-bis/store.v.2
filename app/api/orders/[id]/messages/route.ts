import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase, supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

const db: any = supabaseAdmin ?? supabase

function isOrderMessagesTableMissing(error: any) {
  const code = String(error?.code ?? '')
  const message = String(error?.message ?? '').toLowerCase()

  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    (message.includes('order_messages') &&
      (message.includes('schema cache') ||
        message.includes('does not exist') ||
        message.includes('could not find the table')))
  )
}

const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(1000),
})

function getAuthFromRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.substring(7)
  return verifyToken(token)
}

async function getAuthorizedOrder(orderId: string, userId: string, role?: string) {
  const { data: order, error } = await db
    .from('orders')
    .select('id, customer_id, assigned_seller_id')
    .eq('id', orderId)
    .single()

  if (error || !order) {
    return { error: NextResponse.json({ error: 'Order not found' }, { status: 404 }) }
  }

  const canAccess =
    role === 'admin' || order.customer_id === userId || order.assigned_seller_id === userId

  if (!canAccess) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }) }
  }

  return { order }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getAuthFromRequest(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const authCheck = await getAuthorizedOrder(id, auth.id, auth.role)
    if (authCheck.error) {
      return authCheck.error
    }

    const { data: messageRows, error: messageError } = await db
      .from('order_messages')
      .select('id, sender_id, content, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: true })

    if (messageError) {
      if (isOrderMessagesTableMissing(messageError)) {
        return NextResponse.json({ success: true, chat_configured: false, messages: [] })
      }

      console.error('Get order messages error:', messageError)
      return NextResponse.json(
        { error: messageError.message || 'Unable to load messages' },
        { status: 500 }
      )
    }

    const messages = (messageRows ?? []) as Array<{
      id: string
      sender_id: string
      content: string
      created_at: string
    }>

    const senderIds = [...new Set(messages.map((message) => message.sender_id).filter(Boolean))]

    let userMap = new Map<string, { username: string; avatar_url: string | null }>()
    if (senderIds.length > 0) {
      const { data: users } = await db
        .from('users')
        .select('id, username, avatar_url')
        .in('id', senderIds)

      userMap = new Map(
        ((users ?? []) as Array<{ id: string; username: string; avatar_url: string | null }>).map((user) => [
          user.id,
          { username: user.username ?? 'Unknown User', avatar_url: user.avatar_url ?? null },
        ])
      )
    }

    const formattedMessages = messages.map((message) => ({
      id: message.id,
      content: message.content,
      created_at: message.created_at,
      sender: userMap.get(message.sender_id) ?? { username: 'Unknown User', avatar_url: null },
    }))

    return NextResponse.json({ success: true, chat_configured: true, messages: formattedMessages })
  } catch (error) {
    console.error('Get order messages error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getAuthFromRequest(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const authCheck = await getAuthorizedOrder(id, auth.id, auth.role)
    if (authCheck.error) {
      return authCheck.error
    }

    const body = await request.json()
    const { content } = sendMessageSchema.parse(body)

    const { data: inserted, error: insertError } = await db
      .from('order_messages')
      .insert({
        order_id: id,
        sender_id: auth.id,
        content,
      })
      .select('id, sender_id, content, created_at')
      .single()

    if (insertError || !inserted) {
      if (isOrderMessagesTableMissing(insertError)) {
        return NextResponse.json(
          {
            error: 'Order chat is not configured yet. Please contact support.',
            code: 'CHAT_NOT_CONFIGURED',
          },
          { status: 503 }
        )
      }

      console.error('Send order message error:', insertError)
      return NextResponse.json(
        { error: insertError?.message || 'Unable to send message' },
        { status: 500 }
      )
    }

    const { data: sender } = await db
      .from('users')
      .select('username, avatar_url')
      .eq('id', auth.id)
      .maybeSingle()

    return NextResponse.json({
      success: true,
      message: {
        id: inserted.id,
        content: inserted.content,
        created_at: inserted.created_at,
        sender: {
          username: sender?.username ?? auth.username ?? 'Unknown User',
          avatar_url: sender?.avatar_url ?? null,
        },
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Send order message error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
