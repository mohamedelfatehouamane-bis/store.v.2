import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { hashPassword, verifyPassword, verifyToken } from '@/lib/auth'
import { z } from 'zod'

const updateUserSchema = z
  .object({
    username: z.string().trim().min(3).max(50).optional(),
    current_password: z.string().min(1).optional(),
    new_password: z.string().min(6).max(100).optional(),
  })
  .refine(
    (data) =>
      data.username !== undefined ||
      data.current_password !== undefined ||
      data.new_password !== undefined,
    {
      message: 'At least one field must be updated',
    }
  )
  .refine(
    (data) =>
      (data.current_password === undefined && data.new_password === undefined) ||
      (data.current_password !== undefined && data.new_password !== undefined),
    {
      message: 'Both current password and new password are required to change password',
      path: ['new_password'],
    }
  )

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

    const body = await request.json()
    const payload = updateUserSchema.parse(body)

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, username, role, password_hash')
      .eq('id', auth.id)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const updates: Record<string, string> = {}

    if (payload.username !== undefined) {
      const normalizedUsername = payload.username.trim()

      if (normalizedUsername !== user.username) {
        const { data: duplicateUser, error: duplicateError } = await supabase
          .from('users')
          .select('id')
          .eq('username', normalizedUsername)
          .neq('id', auth.id)
          .maybeSingle()

        if (duplicateError) {
          console.error('Username lookup error:', duplicateError)
          return NextResponse.json(
            { error: duplicateError.message },
            { status: 500 }
          )
        }

        if (duplicateUser) {
          return NextResponse.json(
            { error: 'Username is already taken' },
            { status: 409 }
          )
        }

        updates.username = normalizedUsername
      }
    }

    if (payload.current_password && payload.new_password) {
      const isValidPassword = await verifyPassword(
        payload.current_password,
        user.password_hash
      )

      if (!isValidPassword) {
        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 400 }
        )
      }

      if (payload.current_password === payload.new_password) {
        return NextResponse.json(
          { error: 'New password must be different from current password' },
          { status: 400 }
        )
      }

      updates.password_hash = await hashPassword(payload.new_password)
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
        },
        message: 'No changes were needed',
      })
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', auth.id)
      .select('id, email, username, role')
      .single()

    if (updateError || !updatedUser) {
      console.error('Update user settings error:', updateError)
      return NextResponse.json(
        { error: updateError?.message ?? 'Unable to update settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
      message: 'Settings updated successfully',
    })
  } catch (error) {
    console.error('Update user settings error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
