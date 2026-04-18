import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { encryptGameAccountSecret } from '@/lib/game-account-secrets'
import { z } from 'zod'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const updateAccountSchema = z.object({
  account_identifier: z.string().trim().min(1, 'Account ID is required').max(255).optional(),
  account_email: z.string().trim().email('Invalid email').max(255).optional().or(z.literal('')),
  account_password: z.string().min(1).max(500).optional(),
})

function getIdFromRequest(request: NextRequest): string | null {
  const segments = new URL(request.url).pathname.split('/')
  const id = segments[segments.length - 1]
  return UUID_PATTERN.test(id) ? id : null
}

export async function PUT(request: NextRequest) {
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

    const accountId = getIdFromRequest(request)
    if (!accountId) {
      return NextResponse.json({ error: 'Invalid account ID' }, { status: 400 })
    }

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('game_accounts')
      .select('id, user_id')
      .eq('id', accountId)
      .maybeSingle()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const existingRow = existing as { id: string; user_id: string }
    if (existingRow.user_id !== auth.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = updateAccountSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      )
    }

    const { account_identifier, account_email, account_password } = parsed.data

    if (!account_identifier && account_email === undefined && !account_password) {
      return NextResponse.json(
        { error: 'Provide at least one field to update' },
        { status: 400 }
      )
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (account_identifier) {
      updates.account_identifier = account_identifier.trim()
    }

    if (account_email !== undefined) {
      updates.account_email = account_email.trim() || null
    }

    if (account_password) {
      updates.account_password_encrypted = encryptGameAccountSecret(account_password)
    }

    const { data: updated, error: updateError } = await (supabase
      .from('game_accounts') as any)
      .update(updates)
      .eq('id', accountId)
      .select('id, game_id, account_identifier, account_email, updated_at')
      .single()

    if (updateError) {
      console.error('Game account update error:', updateError)
      return NextResponse.json({ error: 'Unable to update account' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      account: {
        id: updated.id,
        game_id: updated.game_id,
        account_identifier: updated.account_identifier,
        account_email: updated.account_email ?? null,
        updated_at: updated.updated_at,
      },
    })
  } catch (error) {
    console.error('Game account update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
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

    const accountId = getIdFromRequest(request)
    if (!accountId) {
      return NextResponse.json({ error: 'Invalid account ID' }, { status: 400 })
    }

    // Verify ownership before delete
    const { data: existing, error: fetchError } = await supabase
      .from('game_accounts')
      .select('id, user_id')
      .eq('id', accountId)
      .maybeSingle()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const existingRow = existing as { id: string; user_id: string }
    if (existingRow.user_id !== auth.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from('game_accounts')
      .delete()
      .eq('id', accountId)

    if (deleteError) {
      console.error('Game account delete error:', deleteError)
      return NextResponse.json({ error: 'Unable to delete account' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Game account delete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
