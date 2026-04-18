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

const updateCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').optional(),
  description: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();
    const updates = updateCategorySchema.parse(body);

    const adminDb = supabaseAdmin ?? supabase;

    // Check if category exists
    const { data: category, error: fetchError } = await adminDb
      .from('categories')
      .select('id, game_id, name')
      .eq('id', id)
      .single();

    if (fetchError || !category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    // If name is being updated, check for duplicates
    if (updates.name && updates.name !== category.name) {
      const { data: existing } = await adminDb
        .from('categories')
        .select('id')
        .eq('game_id', category.game_id)
        .eq('name', updates.name)
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { error: 'Category with this name already exists for this game' },
          { status: 400 }
        );
      }
    }

    // Update category
    const { data: updatedCategory, error: updateError } = await adminDb
      .from('categories')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Update category error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      category: updatedCategory,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Update category error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const adminDb = supabaseAdmin ?? supabase;

    // Check if category exists
    const { data: category, error: fetchError } = await adminDb
      .from('categories')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    // Check if category is in use (has products)
    const { count, error: countError } = await adminDb
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id);

    if (count && count > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete category: ${count} product(s) using this category`,
          inUse: true,
        },
        { status: 400 }
      );
    }

    // Delete category
    const { error: deleteError } = await adminDb.from('categories').delete().eq('id', id);

    if (deleteError) {
      console.error('Delete category error:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    console.error('Delete category error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
