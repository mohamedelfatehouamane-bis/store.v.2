import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { z } from 'zod';

const createOfferSchema = z.object({
  game_id: z.string().uuid(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unit: z.string().min(1),
  points_price: z.number().int().positive(),
});

function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyToken(authHeader.substring(7));
}

export async function GET(request: NextRequest) {
  try {
    const auth = getAuth(request);
    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let data: any[] | null = null;

    const withName = await supabase
      .from('offers')
      .select(`
        id, name, quantity, unit, points_price, is_active, created_at, updated_at,
        product:product_id(id, name, category:category_id(id, name), game:game_id(id, name))
      `)
      .order('created_at', { ascending: false });

    if (withName.error) {
      const withoutName = await supabase
        .from('offers')
        .select(`
          id, quantity, unit, points_price, is_active, created_at, updated_at,
          product:product_id(id, name, category:category_id(id, name), game:game_id(id, name))
        `)
        .order('created_at', { ascending: false });

      if (withoutName.error) {
        return NextResponse.json({ error: withoutName.error.message }, { status: 500 });
      }

      data = withoutName.data ?? [];
    } else {
      data = withName.data ?? [];
    }

    const offers = (data ?? []).map((o: any) => ({
      id: o.id,
      name: o.name ?? o.product?.name ?? '',
      product_id: o.product?.id ?? null,
      product_name: o.product?.name ?? '',
      category_id: o.product?.category?.id ?? null,
      category_name: o.product?.category?.name ?? '',
      game_id: o.product?.game?.id ?? null,
      game_name: o.product?.game?.name ?? '',
      quantity: o.quantity,
      unit: o.unit,
      points_price: o.points_price,
      is_active: o.is_active,
      created_at: o.created_at,
    }));

    return NextResponse.json({ success: true, offers });
  } catch (error) {
    console.error('Get offers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuth(request);
    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const payload = createOfferSchema.parse(body);

    // Resolve product for this game (use first product, or create a default one)
    let productId: string;
    const { data: existingProduct } = await supabase
      .from('products')
      .select('id')
      .eq('game_id', payload.game_id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingProduct) {
      productId = existingProduct.id;
    } else {
      // Auto-create a default product for this game
      const { data: game } = await supabase
        .from('games')
        .select('name')
        .eq('id', payload.game_id)
        .single();

      const { data: newProduct, error: productError } = await supabase
        .from('products')
        .insert({ game_id: payload.game_id, name: game?.name ?? 'Default' })
        .select('id')
        .single();

      if (productError || !newProduct) {
        return NextResponse.json({ error: 'Failed to resolve product for game' }, { status: 500 });
      }
      productId = newProduct.id;
    }

    let data: any = null;
    let error: any = null;

    const insertWithName = await (supabase as any)
      .from('offers')
      .insert({
        product_id: productId,
        name: payload.name,
        quantity: payload.quantity,
        unit: payload.unit,
        points_price: payload.points_price,
        is_active: true,
      })
      .select('id')
      .single();

    if (insertWithName.error) {
      const insertWithoutName = await (supabase as any)
        .from('offers')
        .insert({
          product_id: productId,
          quantity: payload.quantity,
          unit: payload.unit,
          points_price: payload.points_price,
          is_active: true,
        })
        .select('id')
        .single();

      data = insertWithoutName.data;
      error = insertWithoutName.error;
    } else {
      data = insertWithName.data;
      error = insertWithName.error;
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, offer_id: data.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Create offer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
