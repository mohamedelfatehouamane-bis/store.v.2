import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { hashPassword, generateToken } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { z, ZodError } from 'zod'

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  username: z.string().min(3, 'Username must be at least 3 characters').max(100, 'Username must be at most 100 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().optional(),
  role: z.enum(['customer', 'seller'], {
    errorMap: () => ({ message: 'Role must be either "customer" or "seller"' }),
  }),
})

export async function POST(request: NextRequest) {
  try {
    // Rate limit check
    const rateLimitResult = await checkRateLimit(request, '/api/auth/register')

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: 'Too many registration attempts',
          message: `Please try again in ${rateLimitResult.retryAfter} seconds`,
          retryAfter: rateLimitResult.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.retryAfter),
            'X-RateLimit-Limit': '5',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString(),
          },
        }
      )
    }

    const body = await request.json()
    const parsed = registerSchema.parse(body)
    const { email, username, password, full_name, role } = parsed

    if (!supabaseAdmin) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY for registration route')
      return NextResponse.json(
        { error: 'Server misconfiguration', message: 'Registration service is not configured' },
        { status: 500 }
      )
    }

    // Hash password
    const password_hash = await hashPassword(password)

    // Check if email or username already exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email, username')
      .or(`email.eq.${email},username.eq.${username}`)
      .maybeSingle()

    if (existingUser) {
      const field = existingUser.email === email ? 'email' : 'username'
      return NextResponse.json(
        { error: `A user with this ${field} already exists` },
        { status: 400 }
      )
    }

    // Insert the new user
    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        email,
        username,
        password_hash,
        full_name: full_name || null,
        role,
      })
      .select('id, email, username, role, is_verified')
      .single()

    if (insertError) {
      console.error('Register insert error:', insertError)
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'A user with this email or username already exists' },
          { status: 400 }
        )
      }
      return NextResponse.json(
        { error: 'Database error', message: insertError.message || 'Failed to register user' },
        { status: 500 }
      )
    }

    // If seller role, create a seller profile and capture its id for the JWT.
    let sellerId: string | undefined
    if (role === 'seller') {
      const { data: sellerProfile, error: sellerError } = await supabaseAdmin
        .from('sellers')
        .insert({ user_id: newUser.id })
        .select('id')
        .single()

      if (sellerError) {
        console.error('Seller profile creation error:', sellerError)
      } else {
        sellerId = sellerProfile?.id ?? undefined
      }
    }

    // Generate token
    const token = generateToken({
      id: newUser.id,
      email: newUser.email,
      username: newUser.username,
      role: newUser.role,
      ...(sellerId ? { seller_id: sellerId } : {}),
    })

    return NextResponse.json(
      {
        success: true,
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          role: newUser.role,
          is_verified: newUser.is_verified,
        },
        message: role === 'seller'
          ? 'Registration successful. Your seller profile is pending verification.'
          : 'Registration successful',
      },
      {
        status: 201,
        headers: {
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Remaining': String(Math.max(0, rateLimitResult.remaining - 1)),
          'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString(),
        },
      }
    )
  } catch (error) {
    if (error instanceof ZodError) {
      // Format validation errors clearly
      const formattedErrors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }))

      return NextResponse.json(
        {
          error: 'Validation error',
          details: formattedErrors,
        },
        { status: 400 }
      )
    }

    console.error('Register error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}