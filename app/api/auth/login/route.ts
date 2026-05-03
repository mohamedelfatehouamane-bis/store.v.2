import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseServer as supabase, supabaseAdmin } from '@/lib/db'
import { verifyPassword, hashPassword, generateToken } from '@/lib/auth'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

/**
 * Ensure a row exists in public.users for a Supabase Auth user.
 * Called after a successful Supabase Auth sign-in for users who were created
 * outside the normal register flow (e.g. directly in the Supabase dashboard).
 */
async function syncPublicUser(
  authUid: string,
  email: string,
  password: string,
  meta: { username?: string; role?: string }
) {
  if (!supabaseAdmin) return null

  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id, email, username, role')
    .eq('id', authUid)
    .maybeSingle()

  if (existing) return existing

  // Row is missing – create it now so auth.uid() === public.users.id.
  const password_hash = await hashPassword(password)
  const username =
    meta.username || email.split('@')[0] + '_' + Math.random().toString(36).slice(2, 6)
  const role = meta.role === 'seller' ? 'seller' : 'customer'

  const { data: created } = await supabaseAdmin
    .from('users')
    .insert({ id: authUid, email, username, password_hash, role })
    .select('id, email, username, role')
    .single()

  return created
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = loginSchema.parse(body)

    // ── 1. Try Supabase Auth sign-in first (handles users registered via the
    //        updated register route where auth.uid() === public.users.id). ──
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const authClient = createClient(supabaseUrl, supabaseAnonKey)

    const { data: authSignIn, error: authSignInError } =
      await authClient.auth.signInWithPassword({ email, password })

    let user: any = null

    if (!authSignInError && authSignIn?.user) {
      // Auth sign-in succeeded – resolve the public.users row.
      const authUid = authSignIn.user.id
      const meta = authSignIn.user.user_metadata ?? {}

      // Ensure public.users row exists with id == auth.uid().
      user = await syncPublicUser(authUid, email, password, meta)

      if (!user) {
        // Fallback: look up by auth uid via service role.
        const { data: found } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUid)
          .maybeSingle()
        user = found
      }

      if (!user) {
        return NextResponse.json(
          { error: 'User profile not found. Please contact support.' },
          { status: 404 }
        )
      }
    } else {
      // ── 2. Bcrypt fallback for users who registered before this auth
      //        migration (they have password_hash in public.users but no
      //        corresponding Supabase Auth entry). ──
      const { data: legacyUser, error: dbError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single()

      if (dbError || !legacyUser) {
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401 }
        )
      }

      const isValid = await verifyPassword(password, legacyUser.password_hash)
      if (!isValid) {
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401 }
        )
      }

      user = legacyUser

      // Best-effort: create a Supabase Auth entry for this legacy user so
      // future logins go through Supabase Auth.  We cannot change the existing
      // public.users.id (FK constraints), so note that for truly legacy users
      // auth.uid() will differ from public.users.id until they re-register.
      if (supabaseAdmin) {
        const { data: existingAuthUser } = await supabaseAdmin.auth.admin
          .getUserById(user.id)
          .catch(() => ({ data: null }))

        if (!existingAuthUser?.user) {
          await supabaseAdmin.auth.admin
            .createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: { username: user.username, role: user.role },
            })
            .catch((err: unknown) => {
              // Non-fatal – log and continue.
              console.warn('Could not create Supabase Auth entry for legacy user:', (err as Error)?.message)
            })
        }
      }
    }

    // ── 3. Resolve seller profile so callers never need an extra lookup. ──
    let sellerId: string | undefined
    if (user.role === 'seller') {
      const { data: sellerProfile } = await supabase
        .from('sellers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      sellerId = sellerProfile?.id ?? undefined
    }

    // ── 4. Generate custom JWT (contains public.users.id as `id`). ──
    const token = generateToken({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      ...(sellerId ? { seller_id: sellerId } : {}),
    })

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        ...(sellerId ? { seller_id: sellerId } : {}),
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}