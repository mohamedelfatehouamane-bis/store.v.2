import { NextRequest, NextResponse } from 'next/server';

import { supabaseServer as supabase } from '@/lib/db';

import { verifyToken } from '@/lib/auth';

const MIN_WITHDRAWAL = 1000;

const FEE_PERCENTAGE = 5;

// ======================================================
// GET SELLER FROM TOKEN
// ======================================================

async function getSeller(
  request: NextRequest
) {
  try {
    const authHeader =
      request.headers.get(
        'authorization'
      );

    if (
      !authHeader ||
      !authHeader.startsWith(
        'Bearer '
      )
    ) {
      console.error(
        'Missing auth header'
      );

      return null;
    }

    const token =
      authHeader.substring(7);

    let auth = null;

    try {
      auth =
        verifyToken(token);
    } catch (err) {
      console.error(
        'Token verification failed:',
        err
      );

      return null;
    }

    if (!auth?.id) {
      console.error(
        'Invalid token payload'
      );

      return null;
    }

    const { data: user, error } =
      await supabase
        .from('users')
        .select(`
          id,
          role,
          points,
          status
        `)
        .eq('id', auth.id)
        .single();

    if (error || !user) {
      console.error(
        'User fetch failed:',
        error
      );

      return null;
    }

    return user;
  } catch (err) {
    console.error(
      'getSeller error:',
      err
    );

    return null;
  }
}

// ======================================================
// GET WITHDRAWALS
// ======================================================

export async function GET(
  request: NextRequest
) {
  try {
    const user =
      await getSeller(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data, error } =
      await supabase
        .from('withdrawals')
        .select('*')
        .eq('seller_id', user.id)
        .order('created_at', {
          ascending: false,
        });

    if (error) {
      console.error(error);

      return NextResponse.json(
        {
          error:
            'Failed to load withdrawals',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      withdrawals: data ?? [],
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}

// ======================================================
// CREATE WITHDRAWAL
// ======================================================

export async function POST(
  request: NextRequest
) {
  try {
    const user =
      await getSeller(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (user.role !== 'seller') {
      return NextResponse.json(
        {
          error:
            'Only sellers can withdraw',
        },
        { status: 403 }
      );
    }

    if (user.status !== 'approved') {
      return NextResponse.json(
        {
          error:
            'Seller account not approved',
        },
        { status: 403 }
      );
    }

    const body =
      await request.json();

    const amountRequested =
      Number(
        body.amount_requested
      );

    const paymentMethod =
      body.payment_method;

    const paymentDetails =
      body.payment_details;

    // ============================
    // VALIDATION
    // ============================

    if (
      !amountRequested ||
      amountRequested <
        MIN_WITHDRAWAL
    ) {
      return NextResponse.json(
        {
          error: `Minimum withdrawal is ${MIN_WITHDRAWAL} pts`,
        },
        { status: 400 }
      );
    }

    const balance = Number(
      user.points ?? 0
    );

    if (
      amountRequested > balance
    ) {
      return NextResponse.json(
        {
          error:
            'Insufficient balance',
        },
        { status: 400 }
      );
    }

    // ============================
    // BLOCK MULTIPLE PENDING
    // ============================

    const {
      data: existingPending,
    } = await supabase
      .from('withdrawals')
      .select('id')
      .eq('seller_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingPending) {
      return NextResponse.json(
        {
          error:
            'You already have a pending withdrawal',
        },
        { status: 409 }
      );
    }

    // ============================
    // CALCULATE FEES
    // ============================

    const fee =
      Math.ceil(
        amountRequested *
          (FEE_PERCENTAGE / 100)
      );

    const finalAmount =
      amountRequested - fee;

    // ============================
    // DEDUCT USER BALANCE
    // ============================

    const newBalance =
      balance -
      amountRequested;

    const {
      error: updateError,
    } = await supabase
      .from('users')
      .update({
        points: newBalance,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error(
        updateError
      );

      return NextResponse.json(
        {
          error:
            'Failed to deduct balance',
        },
        { status: 500 }
      );
    }

    // ============================
    // CREATE WITHDRAWAL
    // ============================

    const {
      data: withdrawal,
      error: insertError,
    } = await supabase
      .from('withdrawals')
      .insert({
        seller_id: user.id,

        amount_requested:
          amountRequested,

        fee_percentage:
          FEE_PERCENTAGE,

        final_amount:
          finalAmount,

        payment_method:
          paymentMethod,

        payment_details:
          paymentDetails,

        status: 'pending',
      })
      .select()
      .single();

    // ============================
    // REFUND IF FAILED
    // ============================

    if (insertError) {
      console.error(
        insertError
      );

      await supabase
        .from('users')
        .update({
          points: balance,
        })
        .eq('id', user.id);

      return NextResponse.json(
        {
          error:
            'Failed to create withdrawal',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      withdrawal,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}
