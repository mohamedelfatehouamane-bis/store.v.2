import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const token = authHeader.substring(7);
  const auth = verifyToken(token);
  if (!auth || auth.role !== 'admin') {
    return {
      error: NextResponse.json({ error: 'Only admins can manage seller categories' }, { status: 403 }),
    };
  }

  return { error: null };
}

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = requireAdmin(request);
    if (authError) return authError;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const gameId = searchParams.get('game_id');

    if (!userId) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    let categoriesQuery = supabaseAdmin
      .from('categories')
      .select('id, name, game_id, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (gameId) {
      categoriesQuery = categoriesQuery.eq('game_id', gameId);
    }

    const { data: allCategories, error: allCategoriesError } = await categoriesQuery;

    if (allCategoriesError) {
      return NextResponse.json({ error: allCategoriesError.message }, { status: 500 });
    }

    const { data: assignedRows, error: assignedError } = await supabaseAdmin
      .from('seller_categories')
      .select(`
        seller_id,
        category_id,
        categories (
          id,
          name,
          game_id,
          games (
            id,
            name
          )
        )
      `)
      .eq('seller_id', userId);

    if (assignedError) {
      return NextResponse.json({ error: assignedError.message }, { status: 500 });
    }

    const assignedCategoryIds = new Set((assignedRows ?? []).map((row: any) => String(row.category_id)));

    return NextResponse.json({
      success: true,
      categories: (allCategories ?? []).map((category: any) => ({
        id: category.id,
        name: category.name,
        game_id: category.game_id,
        assigned: assignedCategoryIds.has(String(category.id)),
      })),
      assigned_category_ids: Array.from(assignedCategoryIds),
      assigned_categories: (assignedRows ?? [])
        .map((row: any) => row.categories)
        .filter(Boolean),
    });
  } catch (error) {
    console.error('Get seller categories error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error: authError } = requireAdmin(request);
    if (authError) return authError;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
    }

    const body = await request.json();
    const user_id = String(body?.user_id ?? '').trim();
    const category_ids = Array.isArray(body?.category_ids)
      ? body.category_ids.map((id: unknown) => String(id).trim()).filter(Boolean)
      : [];

    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(user_id)) {
      return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 });
    }

    if (category_ids.some((id: string) => !uuidRegex.test(id))) {
      return NextResponse.json({ error: 'Invalid category_ids' }, { status: 400 });
    }

    const uniqueCategoryIds = Array.from(new Set(category_ids));

    let validCategories: any[] = [];
    if (uniqueCategoryIds.length > 0) {
      const { data, error: validCategoriesError } = await supabaseAdmin
        .from('categories')
        .select('id, game_id')
        .in('id', uniqueCategoryIds);

      if (validCategoriesError) {
        return NextResponse.json({ error: validCategoriesError.message }, { status: 500 });
      }

      validCategories = data ?? [];

      const validIds = new Set(validCategories.map((row: any) => String(row.id)));
      const invalidIds = uniqueCategoryIds.filter((categoryId) => !validIds.has(String(categoryId)));

      if (invalidIds.length > 0) {
        return NextResponse.json(
          {
            error: 'Some categories are invalid',
            details: invalidIds,
          },
          { status: 400 }
        );
      }
    }

    const { error: clearError } = await supabaseAdmin
      .from('seller_categories')
      .delete()
      .eq('seller_id', user_id);

    if (clearError) {
      return NextResponse.json({ error: clearError.message }, { status: 500 });
    }

    if (uniqueCategoryIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Seller categories cleared',
        assignments_count: 0,
      });
    }

    const rows = validCategories.map((category: any) => ({
      seller_id: user_id,
      category_id: category.id,
    }));

    const { error: insertError } = await supabaseAdmin.from('seller_categories').insert(rows);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Seller categories updated',
        assignments_count: rows.length,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Update seller categories error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
