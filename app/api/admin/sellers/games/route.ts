import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { z } from 'zod';

const assignGameSchema = z.object({
  user_id: z.string().uuid(),
  game_id: z.string().uuid(),
});

function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { auth: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const token = authHeader.substring(7);
  const auth = verifyToken(token);
  if (!auth || auth.role !== 'admin') {
    return { auth: null, error: NextResponse.json({ error: 'Only admins can manage seller games' }, { status: 403 }) };
  }
  return { auth, error: null };
}

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = requireAdmin(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    // All active games
    const { data: allGames, error: gamesError } = await supabase
      .from('games')
      .select('id, name, slug, platform')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (gamesError) {
      return NextResponse.json({ error: gamesError.message }, { status: 500 });
    }

    // Seller's current game assignments via sellers.id
    const { data: sellerRow } = await supabase
      .from('sellers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    let assignedGameIds: string[] = [];
    if (sellerRow?.id) {
      const { data: sellerGames } = await supabase
        .from('seller_games')
        .select('game_id')
        .eq('seller_id', sellerRow.id);

      assignedGameIds = (sellerGames ?? []).map((row: any) => row.game_id);
    }

    return NextResponse.json({
      success: true,
      games: (allGames ?? []).map((game: any) => ({
        ...game,
        assigned: assignedGameIds.includes(game.id),
      })),
    });
  } catch (error) {
    console.error('GET seller games error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error: authError } = requireAdmin(request);
    if (authError) return authError;

    const body = await request.json();
    const { user_id, game_id } = assignGameSchema.parse(body);

    // Resolve sellers.id from user_id
    const { data: sellerRow, error: sellerError } = await supabase
      .from('sellers')
      .select('id')
      .eq('user_id', user_id)
      .maybeSingle();

    if (sellerError) {
      return NextResponse.json({ error: sellerError.message }, { status: 500 });
    }

    let sellerId = sellerRow?.id;

    // Auto-create seller profile if absent
    if (!sellerId) {
      const { data: newSeller, error: createError } = await supabase
        .from('sellers')
        .insert({ user_id, verification_status: 'pending' })
        .select('id')
        .single();

      if (createError || !newSeller) {
        return NextResponse.json({ error: createError?.message ?? 'Unable to create seller profile' }, { status: 500 });
      }
      sellerId = newSeller.id;
    }

    const { error: insertError } = await supabase
      .from('seller_games')
      .insert({ seller_id: sellerId, game_id });

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'Game already assigned to this seller' }, { status: 409 });
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Game assigned' }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Assign game error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { error: authError } = requireAdmin(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const gameId = searchParams.get('game_id');

    if (!userId || !gameId) {
      return NextResponse.json({ error: 'user_id and game_id are required' }, { status: 400 });
    }

    const { data: sellerRow, error: sellerError } = await supabase
      .from('sellers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (sellerError) {
      return NextResponse.json({ error: sellerError.message }, { status: 500 });
    }

    if (!sellerRow?.id) {
      return NextResponse.json({ error: 'Seller profile not found' }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from('seller_games')
      .delete()
      .eq('seller_id', sellerRow.id)
      .eq('game_id', gameId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Game unassigned' });
  } catch (error) {
    console.error('Unassign game error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
