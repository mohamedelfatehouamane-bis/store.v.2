import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

/**
 * Link a user's Telegram account
 *
 * POST /api/users/link
 *
 * Request body:
 * {
 *   "telegram_id": "123456789"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const auth = verifyToken(token);

    if (!auth || !auth.id) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const telegramId = String(body?.telegram_id ?? '').trim();

    if (!/^-?\d{5,20}$/.test(telegramId)) {
      return NextResponse.json({ error: 'Invalid telegram ID format' }, { status: 400 });
    }

    const db = supabaseAdmin ?? supabase;

    const { error } = await db
      .from('users')
      .update({ telegram_id: telegramId })
      .eq('id', auth.id);

    if (error) {
      console.error('[Telegram Link] Update error:', error);
      return NextResponse.json({ error: 'Failed to link telegram account' }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Telegram account linked successfully',
        telegram_id: telegramId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Telegram Link] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
