import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

function generateLinkToken() {
  return crypto.randomUUID()
}

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.substring(7)
  return verifyToken(token)
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 })
    }

    const auth = await getAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, telegram_id, telegram_username, telegram_link_token')
      .eq('id', auth.id)
      .single()

    if (error || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || ''
    const bot_url = botUsername ? `https://t.me/${botUsername}` : null
    const deeplink = user.telegram_link_token && botUsername
      ? `https://t.me/${botUsername}?start=${user.telegram_link_token}`
      : null

    return NextResponse.json({
      connected: Boolean(user.telegram_id),
      telegram_id: user.telegram_id ?? null,
      telegram_username: user.telegram_username ?? null,
      telegram_link_token: user.telegram_link_token ?? null,
      bot_url,
      deeplink,
    })
  } catch (error) {
    console.error('Get Telegram link code error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 })
    }

    const auth = await getAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let token = generateLinkToken()

    for (let i = 0; i < 5; i += 1) {
      const { data: collision } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('telegram_link_token', token)
        .maybeSingle()

      if (!collision) {
        break
      }

      token = generateLinkToken()
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ telegram_link_token: token })
      .eq('id', auth.id)

    if (updateError) {
      console.error('Generate Telegram code error:', updateError)
      return NextResponse.json({ error: 'Unable to generate code' }, { status: 500 })
    }

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || ''
    const bot_url = botUsername ? `https://t.me/${botUsername}` : null
    const deeplink = botUsername ? `https://t.me/${botUsername}?start=${token}` : null

    return NextResponse.json({
      success: true,
      message: 'Telegram link token generated successfully.',
      telegram_link_token: token,
      command: `/start ${token}`,
      bot_url,
      deeplink,
    })
  } catch (error) {
    console.error('Generate Telegram link code API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
