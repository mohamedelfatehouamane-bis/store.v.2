import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const auth = verifyToken(token);

    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can approve orders' }, { status: 403 });
    }

    const { data: orderData, error: orderError } = await (supabase
      .from('orders') as any)
      .select('id, assigned_seller_id, points_amount, status, seller_earnings')
      .eq('id', id)
      .single();

    const order = orderData as any;

    if (orderError || !order) {
      console.error('Order lookup error:', orderError);
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.status !== 'completed') {
      return NextResponse.json(
        { error: 'Only completed orders can be approved' },
        { status: 400 }
      );
    }

    if (!order.assigned_seller_id) {
      return NextResponse.json(
        { error: 'Order must have assigned seller' },
        { status: 400 }
      );
    }

    if (order.seller_earnings !== null) {
      return NextResponse.json(
        { error: 'Order has already been settled' },
        { status: 400 }
      );
    }

    const sellerEarn = Number(order.points_amount);
    const fee = 0;

    const { data: sellerUserData, error: sellerUserError } = await (supabase
      .from('users') as any)
      .select('id, balance, points')
      .eq('id', order.assigned_seller_id)
      .single();

    const sellerUser = sellerUserData as any;

    if (sellerUserError || !sellerUser) {
      console.error('Seller user lookup error:', sellerUserError);
      return NextResponse.json({ error: 'Seller user not found' }, { status: 404 });
    }

    const updatedBalance = Number(sellerUser.balance ?? 0) + sellerEarn;
    const updatedTotalPoints = Number(sellerUser.points ?? 0) + sellerEarn;

    const { error: userUpdateError } = await (supabase
      .from('users') as any)
      .update({
        balance: updatedBalance,
        points: updatedTotalPoints,
      })
      .eq('id', sellerUser.id);

    if (userUpdateError) {
      console.error('Seller balance update error:', userUpdateError);
      return NextResponse.json({ error: userUpdateError.message ?? 'Unable to update seller wallet' }, { status: 500 });
    }

    const { error: transactionError } = await (supabase
      .from('point_transactions') as any)
      .insert({
        user_id: sellerUser.id,
        amount: sellerEarn,
        transaction_type: 'order',
        fee,
        status: 'completed',
        reference_id: order.id,
        related_order_id: order.id,
        description: 'Order completion payout',
        balance_before: Number(sellerUser.balance ?? 0),
        balance_after: updatedBalance,
      });

    if (transactionError) {
      console.error('Order payout transaction log error:', transactionError);
      return NextResponse.json({ error: transactionError.message ?? 'Unable to record transaction' }, { status: 500 });
    }

    const { error: orderUpdateError } = await (supabase
      .from('orders') as any)
      .update({
        seller_earnings: sellerEarn,
        platform_fee: Number(order.platform_fee ?? 0),
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    if (orderUpdateError) {
      console.error('Order update error:', orderUpdateError);
      return NextResponse.json({ error: orderUpdateError.message ?? 'Unable to update order record' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Order approved successfully',
      seller_earn: sellerEarn,
      fee,
      order_id: id,
    });
  } catch (error) {
    console.error('Approve order error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
