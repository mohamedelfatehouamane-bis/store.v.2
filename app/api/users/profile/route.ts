import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing authorization token' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const auth = verifyToken(token);

    if (!auth) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', auth.id)
      .single();

    if (error || !user) {
      console.error('Profile query error:', error);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    let verification_status = 'pending'
    let rejection_reason: string | null = null
    let business_description: string | null = null
    let assigned_games: string[] = []
    let assigned_game_ids: string[] = []
    let average_rating = 0
    let total_reviews = 0

    if (user.role === 'seller') {
      const { data: seller, error: sellerError } = await supabase
        .from('sellers')
        .select('id, verification_status, rejection_reason, business_description, average_rating, total_reviews')
        .eq('user_id', auth.id)
        .single()

      if (!sellerError && seller) {
        verification_status = seller.verification_status ?? 'pending'
        rejection_reason = seller.rejection_reason ?? null
        business_description = seller.business_description ?? null
        average_rating = Number(seller.average_rating ?? 0)
        total_reviews = Number(seller.total_reviews ?? 0)

        const { data: sellerGames, error: sellerGamesError } = await supabase
          .from('seller_games')
          .select('game_id')
          .eq('seller_id', seller.id)

        const gameIds = (sellerGames ?? []).map((item: any) => item.game_id)
        assigned_game_ids = gameIds

        if (gameIds.length > 0) {
          const { data: gamesData, error: gamesError } = await supabase
            .from('games')
            .select('id, name')
            .in('id', gameIds)

          if (!gamesError && gamesData) {
            assigned_games = (gamesData as any[]).map((game) => game.name)
          }
        }
      }
    }

    const normalizedUser = {
      ...user,
      total_points: Number(user.points ?? 0),
      balance: Number(user.balance ?? user.points ?? 0),
      is_verified: user.is_verified ?? false,
      verification_status,
      rejection_reason,
      business_description,
      average_rating,
      total_reviews,
      assigned_games,
      assigned_game_ids,
    };

    return NextResponse.json({
      success: true,
      user: normalizedUser,
    });
  } catch (error) {
    console.error('Profile error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
