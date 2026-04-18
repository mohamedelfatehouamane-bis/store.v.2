import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const segments = new URL(request.url).pathname.split('/')
    const gameId = segments[segments.indexOf('games') + 1]

    if (!gameId) {
      return NextResponse.json({ error: 'Game ID is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('categories')
      .select('id, name, description, is_active, created_at')
      .eq('game_id', gameId)
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) {
      console.error('Categories API error:', error)
      return NextResponse.json({ error: 'Unable to load categories' }, { status: 500 })
    }

    return NextResponse.json({ categories: data ?? [] })
  } catch (error) {
    console.error('Categories API unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
