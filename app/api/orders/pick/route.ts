import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { telegramService } from '@/lib/telegram-service';
import { addOrderEvent } from '@/lib/order-events';
import { z } from 'zod';

const pickOrderSchema = z.object({
  order_id: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const auth = verifyToken(token);

    if (!auth || auth.role !== 'seller') {
      return NextResponse.json({ error: 'Only sellers can pick orders' }, { status: 403 });
    }

    const body = await request.json();
    const { order_id } = pickOrderSchema.parse(body);

    const db = supabaseAdmin ?? supabase;

    const { data: order, error: orderError } = await db
      .from('orders')
      .select('id, status, assigned_seller_id, points_amount, customer_id')
      .eq('id', order_id)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found or already picked' }, { status: 404 });
    }

    if (order.status !== 'open' || order.assigned_seller_id) {
      return NextResponse.json({ error: 'Order was already picked by another seller' }, { status: 409 });
    }

    const { data: seller, error: sellerError } = await db
      .from('sellers')
      .select('id, verification_status')
      .eq('user_id', auth.id)
      .maybeSingle();

    if (sellerError || !seller) {
      return NextResponse.json({ error: 'Seller profile not found' }, { status: 403 });
    }

    if (seller.verification_status !== 'verified' && seller.verification_status !== 'approved') {
      return NextResponse.json(
        { error: 'Only verified sellers can pick orders' },
        { status: 403 }
      );
    }

    const { data: pickedOrder, error: pickError } = await db
      .from('orders')
      .update({
        assigned_seller_id: auth.id,
        status: 'in_progress',
        picked_at: new Date().toISOString(),
      })
      .eq('id', order_id)
      .eq('status', 'open')
      .is('assigned_seller_id', null)
      .select('id, points_amount')
      .maybeSingle();

    if (pickError || !pickedOrder) {
      return NextResponse.json({ error: 'Order was already picked by another seller' }, { status: 409 });
    }

    // Seller gets full order amount; fees are handled on customer side.
    const gross = Number(pickedOrder.points_amount ?? order.points_amount ?? 0);
    const seller_earnings = gross;

    await db
      .from('orders')
      .update({ seller_earnings })
      .eq('id', order_id);

    await db
      .from('order_logs')
      .insert({
        order_id,
        seller_id: auth.id,
        action: 'accept',
        result: 'success',
        details: { seller_earnings },
      });

    await addOrderEvent(db, {
      orderId: order_id,
      type: 'accepted',
      message: 'Seller accepted the order',
      userId: auth.id,
    })

    const { data: customer } = await db
      .from('users')
      .select('telegram_id')
      .eq('id', order.customer_id)
      .maybeSingle();

    if (customer?.telegram_id) {
      void telegramService
        .sendMessage(
          customer.telegram_id,
          telegramService.orderUpdatedMessage(String(order_id), 'In Progress')
        )
        .catch((err) => {
          console.warn('[Orders][Pick] Telegram notify skipped:', err instanceof Error ? err.message : String(err));
        });
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Order picked successfully',
        order_id,
        seller_earnings,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Pick order error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
