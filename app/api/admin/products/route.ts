import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { ensureBucket, sanitizeStorageFileName } from '@/lib/storage';
import { z } from 'zod';
import { calculateTrustScore } from '@/lib/trust-score';

const createProductSchema = z.object({
  game_id: z.string().uuid(),
  category_id: z.string().uuid(),
  name: z.string().min(1),
  points_price: z.coerce.number().int().positive(),
  description: z.string().optional(),
});

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024;

function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { status: 401 as const, error: 'Unauthorized: missing token' };
  }

  const auth = verifyToken(authHeader.substring(7));
  if (!auth) {
    return { status: 401 as const, error: 'Unauthorized: invalid token' };
  }

  if (auth.role !== 'admin') {
    return { status: 403 as const, error: 'Forbidden: admin role required' };
  }

  return { status: 200 as const, auth };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = getAuth(request);
    if (authResult.status !== 200) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const productQuery = await supabase
      .from('products')
      .select(`
        id, name, description, is_active, created_at, image_url, points_price, status, category_id, game_id, seller_id
      `)
      .order('created_at', { ascending: false });

    if (productQuery.error) {
      return NextResponse.json({ error: productQuery.error.message }, { status: 500 });
    }

    const rawProducts = productQuery.data ?? []
    const gameIds = Array.from(
      new Set(
        rawProducts
          .map((product: any) => product.game_id)
          .filter((id: string | null | undefined) => Boolean(id))
      )
    )
    const sellerIds = Array.from(
      new Set(
        rawProducts
          .map((product: any) => product.seller_id)
          .filter((id: string | null | undefined) => Boolean(id))
      )
    )
    const categoryIds = Array.from(
      new Set(rawProducts
        .map((p: any) => p.category_id)
        .filter((id: string | null | undefined) => Boolean(id)))
    )

    const gamesById: Record<string, { id: string; name: string }> = {}
    if (gameIds.length > 0) {
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('id, name')
        .in('id', gameIds)

      if (gameError) {
        console.error('Get admin product games error:', gameError)
      } else {
        (gameData ?? []).forEach((game: any) => {
          gamesById[game.id] = { id: game.id, name: game.name }
        })
      }
    }

    const sellersById: Record<string, { id: string; username: string; rating: number; completed_orders: number; dispute_count: number; trust_score: number }> = {}
    if (sellerIds.length > 0) {
      let sellerData: any[] = []

      const { data: sellerDataWithReputation, error: sellerDataWithReputationError } = await supabase
        .from('users')
        .select('id, username, rating, completed_orders, dispute_count')
        .in('id', sellerIds)

      if (sellerDataWithReputationError && sellerDataWithReputationError.code === '42703') {
        const { data: sellerDataLegacy, error: sellerDataLegacyError } = await supabase
          .from('users')
          .select('id, username')
          .in('id', sellerIds)

        if (sellerDataLegacyError) {
          console.error('Get admin product sellers fallback error:', sellerDataLegacyError)
        } else {
          sellerData = sellerDataLegacy ?? []
        }
      } else if (sellerDataWithReputationError) {
        console.error('Get admin product sellers error:', sellerDataWithReputationError)
      } else {
        sellerData = sellerDataWithReputation ?? []
      }

      if (sellerData.length > 0) {
        sellerData.forEach((seller: any) => {
          const rating = Number(seller.rating ?? 0)
          const completedOrders = Number(seller.completed_orders ?? 0)
          const disputeCount = Number(seller.dispute_count ?? 0)

          sellersById[seller.id] = {
            id: seller.id,
            username: seller.username,
            rating,
            completed_orders: completedOrders,
            dispute_count: disputeCount,
            trust_score: calculateTrustScore({
              rating,
              completed_orders: completedOrders,
              dispute_count: disputeCount,
            }),
          }
        })
      }
    }

    const categoriesById: Record<string, { id: string; name: string }> = {}
    if (categoryIds.length > 0) {
      const { data: categoryData, error: categoryError } = await supabase
        .from('categories')
        .select('id, name')
        .in('id', categoryIds)

      if (categoryError) {
        console.error('Get admin product categories error:', categoryError)
      } else {
        (categoryData ?? []).forEach((category: any) => {
          categoriesById[category.id] = { id: category.id, name: category.name }
        })
      }
    }

    const products = rawProducts.map((p: any) => ({
      id: p.id,
      game_id: p.game_id ?? null,
      game_name: p.game_id ? gamesById[p.game_id]?.name ?? '' : '',
      category_id: p.category_id ?? null,
      category_name: p.category_id ? categoriesById[p.category_id]?.name ?? '' : '',
      seller_id: p.seller_id ?? null,
      seller_name: p.seller_id ? sellersById[p.seller_id]?.username ?? '' : '',
      seller: p.seller_id ? sellersById[p.seller_id] ?? null : null,
      seller_trust_score: p.seller_id ? sellersById[p.seller_id]?.trust_score ?? null : null,
      name: p.name,
      description: p.description,
      image_url: p.image_url ?? null,
      points_price: p.points_price ?? null,
      status: p.status ?? 'approved',
      is_active: p.is_active,
      created_at: p.created_at,
    }))

    return NextResponse.json({ success: true, products });
  } catch (error) {
    console.error('Get products error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = getAuth(request);
    if (authResult.status !== 200) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server misconfiguration', message: 'Image upload service is not configured' },
        { status: 500 }
      );
    }

    try {
      await ensureBucket(supabaseAdmin, 'products', '25MB');
    } catch (bucketError) {
      return NextResponse.json(
        { error: bucketError instanceof Error ? bucketError.message : 'Unable to prepare product storage bucket' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const imageFile = formData.get('image_file');
    const parsed = createProductSchema.parse({
      game_id: String(formData.get('game_id') || '').trim(),
      category_id: String(formData.get('category_id') || '').trim(),
      name: String(formData.get('name') || '').trim(),
      points_price: formData.get('points_price'),
      description: String(formData.get('description') || '').trim() || undefined,
    });
    const { game_id, category_id, name, points_price, description } = parsed;

    if (!(imageFile instanceof File)) {
      return NextResponse.json(
        { error: 'Validation error', details: [{ field: 'image_file', message: 'Image file is required' }] },
        { status: 400 }
      );
    }

    if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
      return NextResponse.json(
        { error: 'Validation error', details: [{ field: 'image_file', message: 'Only JPG, PNG, WEBP, or GIF images are allowed' }] },
        { status: 400 }
      );
    }

    if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'Validation error', details: [{ field: 'image_file', message: 'Image size must be 25MB or less' }] },
        { status: 400 }
      );
    }

    const { data: gameExists, error: gameError } = await supabase
      .from('games')
      .select('id')
      .eq('id', game_id)
      .maybeSingle();

    if (gameError) {
      return NextResponse.json({ error: gameError.message }, { status: 500 });
    }

    if (!gameExists) {
      return NextResponse.json({ error: 'Validation error', details: [{ field: 'game_id', message: 'Game not found' }] }, { status: 400 });
    }

    const { data: categoryExists, error: categoryError } = await supabase
      .from('categories')
      .select('id')
      .eq('id', category_id)
      .eq('game_id', game_id)
      .maybeSingle();

    if (categoryError) {
      return NextResponse.json({ error: categoryError.message }, { status: 500 });
    }

    if (!categoryExists) {
      return NextResponse.json({ error: 'Validation error', details: [{ field: 'category_id', message: 'Category not found for the selected game' }] }, { status: 400 });
    }

    const adminClient = supabaseAdmin;
    const originalName = sanitizeStorageFileName(imageFile.name);
    const storagePath = `products/${Date.now()}-${originalName}`;
    const bytes = await imageFile.arrayBuffer();
    const fileBytes = Buffer.from(bytes);

    const uploadResult = await adminClient.storage
      .from('products')
      .upload(storagePath, fileBytes, {
        contentType: imageFile.type,
        upsert: false,
      });

    if (uploadResult.error) {
      return NextResponse.json(
        { error: uploadResult.error.message || 'Unable to upload product image' },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = adminClient.storage
      .from('products')
      .getPublicUrl(storagePath);

    const image_url = publicUrlData.publicUrl;

    const productInsert = await (supabase as any)
      .from('products')
      .insert({
        game_id,
        category_id,
        name,
        points_price,
        description: description || null,
        image_url,
        type: 'admin',
        seller_id: null,
        status: 'approved',
      })
      .select('id, game_id, category_id, name, points_price, image_url, description, is_active, status, created_at')
      .single();

    if (productInsert.error || !productInsert.data) {
      await adminClient.storage.from('products').remove([storagePath]);
      return NextResponse.json({ error: productInsert.error?.message || 'Failed to create product' }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        product: productInsert.data,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.errors.map((item) => ({
        field: item.path.join('.') || 'body',
        message: item.message,
      }));
      return NextResponse.json({ error: 'Validation error', details }, { status: 400 });
    }
    console.error('Create product error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
