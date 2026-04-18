import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { z } from 'zod';

const updateOfferSchema = z.object({
  name: z.string().min(1).optional(),
  quantity: z.number().int().positive().optional(),
  unit: z.string().min(1).optional(),
  points_price: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
});

function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyToken(authHeader.substring(7));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = getAuth(request);
    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const payload = updateOfferSchema.parse(body);

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const baseUpdate = {
      quantity: payload.quantity,
      unit: payload.unit,
      points_price: payload.points_price,
      is_active: payload.is_active,
      updated_at: new Date().toISOString(),
    };

    const withNameUpdate = {
      ...baseUpdate,
      name: payload.name,
    };

    const firstAttempt = await (supabase as any)
      .from('offers')
      .update(withNameUpdate)
      .eq('id', id);

    let error = firstAttempt.error;

    if (error) {
      const fallbackAttempt = await (supabase as any)
        .from('offers')
        .update(baseUpdate)
        .eq('id', id);

      error = fallbackAttempt.error;
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Update offer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = getAuth(request);
    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { count, error: orderCountError } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('offer_id', id);

    if (orderCountError) {
      console.error('Offer delete order count error:', orderCountError);
      return NextResponse.json({ error: orderCountError.message }, { status: 500 });
    }

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Cannot delete offer because existing orders reference it' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('offers')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete offer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
