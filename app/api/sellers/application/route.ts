import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { z } from 'zod'

const sellerApplicationSchema = z.object({
  business_name: z.string().trim().optional(),
  business_description: z.string().trim().min(1),
  game_ids: z.array(z.string().trim().min(1)).min(1),
})

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

    const body = await request.json()
    const payload = sellerApplicationSchema.parse(body)

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', auth.id)
      .single()

    if (userError || !user) {
      console.error('Seller application user lookup error:', userError)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: validGames, error: gamesError } = await supabase
      .from('games')
      .select('id')
      .in('id', payload.game_ids)

    if (gamesError) {
      console.error('Seller application game lookup error:', gamesError)
      return NextResponse.json({ error: 'Unable to validate selected games' }, { status: 500 })
    }

    const validGameIds = (validGames ?? []).map((game: any) => game.id)
    if (validGameIds.length !== payload.game_ids.length) {
      return NextResponse.json({ error: 'One or more selected games are invalid' }, { status: 400 })
    }

    const { data: existingSeller, error: sellerLookupError } = await supabase
      .from('sellers')
      .select('id')
      .eq('user_id', auth.id)
      .maybeSingle()

    if (sellerLookupError) {
      console.error('Seller lookup error:', sellerLookupError)
      return NextResponse.json({ error: 'Unable to process seller profile' }, { status: 500 })
    }

    let sellerId = existingSeller?.id
    if (!sellerId) {
      const { data: insertResult, error: insertError } = await supabase
        .from('sellers')
        .insert({
          user_id: auth.id,
          business_name: payload.business_name ?? null,
          business_description: payload.business_description,
          verification_status: 'pending',
          rejection_reason: null,
        })
        .select('id')
        .single()

      if (insertError || !insertResult) {
        console.error('Seller creation error:', insertError)
        return NextResponse.json({ error: 'Unable to create seller profile' }, { status: 500 })
      }

      sellerId = insertResult.id
    } else {
      const { error: updateError } = await supabase
        .from('sellers')
        .update({
          business_name: payload.business_name ?? null,
          business_description: payload.business_description,
          verification_status: 'pending',
          rejection_reason: null,
        })
        .eq('id', sellerId)

      if (updateError) {
        console.error('Seller update error:', updateError)
        return NextResponse.json({ error: 'Unable to update seller profile' }, { status: 500 })
      }
    }

    if (user.role !== 'seller') {
      const { error: roleUpdateError } = await supabase
        .from('users')
        .update({ role: 'seller', is_verified: false })
        .eq('id', auth.id)

      if (roleUpdateError) {
        console.error('Seller role update error:', roleUpdateError)
        return NextResponse.json({ error: 'Unable to set seller role' }, { status: 500 })
      }
    }

    const { error: deleteError } = await supabase
      .from('seller_games')
      .delete()
      .eq('seller_id', sellerId)

    if (deleteError) {
      console.error('Seller game cleanup error:', deleteError)
      return NextResponse.json({ error: 'Unable to update seller game selections' }, { status: 500 })
    }

    const assignments = validGameIds.map((gameId) => ({ seller_id: sellerId, game_id: gameId }))
    const { error: assignError } = await supabase
      .from('seller_games')
      .insert(assignments)

    if (assignError) {
      console.error('Seller game assignment error:', assignError)
      return NextResponse.json({ error: 'Unable to save selected games' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Seller application submitted for review' })
  } catch (error) {
    console.error('Seller application error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
