import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer as supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { z } from 'zod';

const assignCategorySchema = z.object({
  user_id: z.string().uuid(),
  category_id: z.string().uuid(),
});

function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      auth: null,
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.substring(7);
  const auth = verifyToken(token);

  if (!auth || auth.role !== 'admin') {
    return {
      auth: null,
      error: NextResponse.json(
        { error: 'Only admins can manage seller categories' },
        { status: 403 }
      ),
    };
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
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    // Get all active categories
    const { data: allCategories, error: categoriesError } =
      await supabase
        .from('categories')
        .select(`
          id,
          name,
          description,
          game_id
        `)
        .eq('is_active', true)
        .order('name', { ascending: true });

    if (categoriesError) {
      return NextResponse.json(
        { error: categoriesError.message },
        { status: 500 }
      );
    }

    // Get seller assigned categories
    const { data: assignedCategories, error: assignedError } =
      await supabase
        .from('seller_categories')
        .select('category_id')
        .eq('seller_id', userId);

    if (assignedError) {
      return NextResponse.json(
        { error: assignedError.message },
        { status: 500 }
      );
    }

    const assignedCategoryIds =
      assignedCategories?.map(
        (row: any) => row.category_id
      ) || [];

    return NextResponse.json({
      success: true,
      categories: (allCategories || []).map(
        (category: any) => ({
          ...category,
          assigned: assignedCategoryIds.includes(
            category.id
          ),
        })
      ),
    });
  } catch (error) {
    console.error('GET seller categories error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error: authError } = requireAdmin(request);

    if (authError) return authError;

    const body = await request.json();

    const { user_id, category_id } =
      assignCategorySchema.parse(body);

    const { error: insertError } =
      await supabase
        .from('seller_categories')
        .insert({
          seller_id: user_id,
          category_id,
        });

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json(
          {
            error:
              'Category already assigned to this seller',
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Category assigned successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    console.error('Assign category error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { error: authError } = requireAdmin(request);

    if (authError) return authError;

    const { searchParams } = new URL(request.url);

    const userId = searchParams.get('user_id');

    const categoryId =
      searchParams.get('category_id');

    if (!userId || !categoryId) {
      return NextResponse.json(
        {
          error:
            'user_id and category_id are required',
        },
        { status: 400 }
      );
    }

    const { error: deleteError } =
      await supabase
        .from('seller_categories')
        .delete()
        .eq('seller_id', userId)
        .eq('category_id', categoryId);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Category unassigned successfully',
    });
  } catch (error) {
    console.error('Delete category error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
