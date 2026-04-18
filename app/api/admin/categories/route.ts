import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { z } from 'zod';

function getAuthFromRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  return verifyToken(token);
}

const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  game_id: z.string().min(1, 'Game ID is required'),
  description: z.string().optional().nullable(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').optional(),
  description: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get('gameId');

    const adminDb = supabaseAdmin ?? supabase;
    let query = adminDb.from('categories').select('*').order('created_at', { ascending: true });

    if (gameId) {
      query = query.eq('game_id', gameId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Get categories error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      categories: data ?? [],
    });
  } catch (error) {
    console.error('Get categories error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, game_id, description } = createCategorySchema.parse(body);

    const adminDb = supabaseAdmin ?? supabase;

    // Check if game exists
    const { data: game, error: gameError } = await adminDb
      .from('games')
      .select('id')
      .eq('id', game_id)
      .single();

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Check if category with same name already exists for this game
    const { data: existing } = await adminDb
      .from('categories')
      .select('id')
      .eq('game_id', game_id)
      .eq('name', name)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'Category with this name already exists for this game' },
        { status: 400 }
      );
    }

    // Create category
    const { data: newCategory, error: createError } = await adminDb
      .from('categories')
      .insert({
        name,
        game_id,
        description: description ?? null,
        is_active: true,
      })
      .select()
      .single();

    if (createError) {
      console.error('Create category error:', createError);
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        category: newCategory,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Create category error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
