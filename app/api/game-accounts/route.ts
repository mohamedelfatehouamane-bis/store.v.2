import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { encryptGameAccountSecret } from '@/lib/game-account-secrets'
import { z } from 'zod'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const createAccountSchema = z.object({
  game_id: z.string().trim().regex(UUID_PATTERN, 'Invalid game_id'),
  account_identifier: z.string().trim().min(1, 'Account ID is required').max(255),
  account_email: z.string().trim().email('Invalid email').max(255).optional(),
  account_password: z.string().min(1).max(500).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('game_accounts')
      .select(`
        id,
        game_id,
        account_identifier,
        account_email,
        created_at,
        updated_at,
        games ( name, image_url )
      `)
      .eq('user_id', auth.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Game accounts query error:', error)
      return NextResponse.json({ error: 'Unable to load game accounts' }, { status: 500 })
    }

    const accounts = (data ?? []).map((item: any) => ({
      id: String(item.id),
      game_id: item.game_id ?? null,
      game_name: item.games?.name ?? null,
      game_image: item.games?.image_url ?? null,
      account_identifier: item.account_identifier,
      account_email: item.account_email ?? null,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }))

    return NextResponse.json({ accounts })
  } catch (error) {
    console.error('Game accounts error:', error)
    return NextResponse.json({ error: 'Unable to load game accounts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = createAccountSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      )
    }

    const { game_id, account_identifier, account_email, account_password } = parsed.data

    // Validate game exists
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id')
      .eq('id', game_id)
      .maybeSingle()

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 400 })
    }

    // Encrypt password if provided
    let account_password_encrypted: string | null = null
    if (account_password) {
      account_password_encrypted = encryptGameAccountSecret(account_password)
    }

    const { data: inserted, error: insertError } = await supabase
      .from('game_accounts')
      .insert({
        user_id: auth.id,
        game_id,
        account_identifier: account_identifier.trim(),
        account_email: account_email?.trim() ?? null,
        account_password_encrypted,
      })
      .select('id, game_id, account_identifier, account_email, created_at, updated_at')
      .single()

    if (insertError) {
      console.error('Game account insert error:', insertError)
      return NextResponse.json({ error: 'Unable to create game account' }, { status: 500 })
    }

    return NextResponse.json(
      {
        success: true,
        account: {
          id: inserted.id,
          game_id: inserted.game_id,
          account_identifier: inserted.account_identifier,
          account_email: inserted.account_email ?? null,
          created_at: inserted.created_at,
          updated_at: inserted.updated_at,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Game account create error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
