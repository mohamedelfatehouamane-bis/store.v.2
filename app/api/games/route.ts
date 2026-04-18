import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

export async function GET(_request: NextRequest) {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('id, name, description, image_url, slug, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) {
      console.error('Games API error:', error)
      return NextResponse.json({ games: [] }, { status: 500 })
    }

    const games = (data ?? []).map((game: any) => ({
      id: game.id,
      name: game.name,
      description: game.description,
      image_url: game.image_url,
      slug: game.slug,
    }))

    return NextResponse.json({ games })
  } catch (error) {
    console.error('Games API unexpected error:', error)
    return NextResponse.json({ games: [] }, { status: 500 })
  }
}
