import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { buildTrustSummary } from '@/lib/trust-score';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort') || 'rating';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const gameId = searchParams.get('gameId');

    let users: any[] = [];
    const usersSelectWithReputation =
      'id, username, avatar_url, points, is_active, role, rating, total_reviews, completed_orders, dispute_count';

    const { data: usersWithReputation, error: usersWithReputationError } = await supabase
      .from('users')
      .select(usersSelectWithReputation)
      .eq('role', 'seller')
      .eq('is_active', true)
      .limit(limit * 3);

    if (usersWithReputationError && usersWithReputationError.code === '42703') {
      const { data: usersLegacy, error: usersLegacyError } = await supabase
        .from('users')
        .select('id, username, avatar_url, points, is_active, role')
        .eq('role', 'seller')
        .eq('is_active', true)
        .limit(limit * 3);

      if (usersLegacyError) {
        console.error('Get sellers users fallback error:', usersLegacyError);
        return NextResponse.json({ error: usersLegacyError.message }, { status: 500 });
      }

      users = usersLegacy ?? [];
    } else if (usersWithReputationError) {
      console.error('Get sellers users error:', usersWithReputationError);
      return NextResponse.json({ error: usersWithReputationError.message }, { status: 500 });
    } else {
      users = usersWithReputation ?? [];
    }

    const userIds = users.map((u: any) => String(u.id));
    if (userIds.length === 0) {
      return NextResponse.json({ success: true, sellers: [] });
    }

    const { data: sellerProfiles, error: profilesError } = await supabase
      .from('sellers')
      .select('id, user_id, business_name, business_description, total_tasks_completed, average_rating, fee_percentage, verification_status')
      .in('user_id', userIds)
      .eq('verification_status', 'verified');

    if (profilesError) {
      console.error('Get sellers profiles error:', profilesError);
      return NextResponse.json({ error: profilesError.message }, { status: 500 });
    }

    const profiles = sellerProfiles ?? [];
    const sellerIds = profiles.map((s: any) => String(s.id));
    const profileByUserId = new Map(profiles.map((s: any) => [String(s.user_id), s]));

    const { data: assignments, error: assignmentsError } = sellerIds.length
      ? await supabase
          .from('seller_games')
          .select('seller_id, game_id')
          .in('seller_id', sellerIds)
      : { data: [], error: null };

    if (assignmentsError) {
      console.error('Get sellers assignments error:', assignmentsError);
      return NextResponse.json({ error: assignmentsError.message }, { status: 500 });
    }

    const allGameIds = Array.from(
      new Set((assignments ?? []).map((a: any) => a.game_id).filter(Boolean))
    );

    const { data: gamesData, error: gamesError } = allGameIds.length
      ? await supabase.from('games').select('id, name').in('id', allGameIds)
      : { data: [], error: null };

    if (gamesError) {
      console.error('Get sellers games error:', gamesError);
      return NextResponse.json({ error: gamesError.message }, { status: 500 });
    }

    const gameNameById = new Map((gamesData ?? []).map((g: any) => [String(g.id), String(g.name)]));
    const assignmentMap = new Map<string, string[]>();

    (assignments ?? []).forEach((row: any) => {
      const sellerId = String(row.seller_id);
      const gameName = gameNameById.get(String(row.game_id));
      if (!gameName) return;
      const current = assignmentMap.get(sellerId) ?? [];
      current.push(gameName);
      assignmentMap.set(sellerId, current);
    });

    const { data: inProgressOrders, error: ordersError } = await supabase
      .from('orders')
      .select('assigned_seller_id')
      .eq('status', 'in_progress')
      .in('assigned_seller_id', userIds);

    if (ordersError) {
      console.error('Get sellers active orders error:', ordersError);
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    const activeOrdersCountByUserId = new Map<string, number>();
    (inProgressOrders ?? []).forEach((order: any) => {
      const key = String(order.assigned_seller_id);
      activeOrdersCountByUserId.set(key, (activeOrdersCountByUserId.get(key) ?? 0) + 1);
    });

    let sellers = users
      .map((u: any) => {
        const profile = profileByUserId.get(String(u.id));
        if (!profile) return null;
        const assignedGames = assignmentMap.get(String(profile.id)) ?? [];

        const averageRating = Number(
          u.rating ?? profile.average_rating ?? 0
        );
        const completedOrders = Number(
          u.completed_orders ?? profile.total_tasks_completed ?? 0
        );
        const totalReviews = Number(u.total_reviews ?? 0);
        const disputeCount = Number(u.dispute_count ?? 0);
        const trust = buildTrustSummary({
          rating: averageRating,
          completed_orders: completedOrders,
          dispute_count: disputeCount,
        });

        return {
          id: String(u.id),
          username: u.username,
          avatar_url: u.avatar_url,
          total_points: Number(u.points ?? 0),
          business_name: profile.business_name ?? null,
          business_description: profile.business_description ?? null,
          total_tasks_completed: completedOrders,
          completed_orders: completedOrders,
          average_rating: averageRating,
          rating: averageRating,
          total_reviews: totalReviews,
          dispute_count: disputeCount,
          fee_percentage: Number(profile.fee_percentage ?? 10),
          active_orders: activeOrdersCountByUserId.get(String(u.id)) ?? 0,
          assigned_games: assignedGames,
          trust_score: trust.trust_score,
          trust_badge: trust.trust_badge,
          is_risky: trust.is_risky,
        };
      })
      .filter(Boolean) as any[];

    if (gameId) {
      const sellerIdsForGame = new Set(
        (assignments ?? [])
          .filter((row: any) => String(row.game_id) === String(gameId))
          .map((row: any) => String(row.seller_id))
      );
      sellers = sellers.filter((s) => {
        const profile = profileByUserId.get(String(s.id));
        return profile ? sellerIdsForGame.has(String(profile.id)) : false;
      });
    }

    if (sort === 'trust') {
      sellers.sort((a, b) => {
        if (b.trust_score !== a.trust_score) {
          return b.trust_score - a.trust_score;
        }

        if (b.average_rating !== a.average_rating) {
          return b.average_rating - a.average_rating;
        }

        return b.completed_orders - a.completed_orders;
      });
    } else if (sort === 'tasks') {
      sellers.sort((a, b) => b.total_tasks_completed - a.total_tasks_completed);
    } else if (sort === 'points') {
      sellers.sort((a, b) => b.total_points - a.total_points);
    } else {
      sellers.sort((a, b) => b.average_rating - a.average_rating);
    }

    sellers = sellers.slice(0, limit);

    return NextResponse.json({
      success: true,
      sellers,
    });
  } catch (error) {
    console.error('Get sellers error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const auth = verifyToken(token);

    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: existingSeller, error: existingSellerError } = await supabase
      .from('sellers')
      .select('id')
      .eq('user_id', auth.id)
      .maybeSingle();

    if (existingSellerError) {
      console.error('Check existing seller error:', existingSellerError);
      return NextResponse.json(
        { error: existingSellerError.message },
        { status: 500 }
      );
    }

    if (existingSeller) {
      return NextResponse.json(
        { error: 'Seller profile already exists' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { business_name, business_description } = body;

    const { error: createSellerError } = await supabase
      .from('sellers')
      .insert({
        user_id: auth.id,
        business_name: business_name || null,
        business_description: business_description || null,
        verification_status: 'pending',
      });

    if (createSellerError) {
      console.error('Create seller profile error:', createSellerError);
      return NextResponse.json(
        { error: createSellerError.message },
        { status: 500 }
      );
    }

    const { error: updateUserError } = await supabase
      .from('users')
      .update({ role: 'seller', is_verified: false })
      .eq('id', auth.id);

    if (updateUserError) {
      console.error('Update user to seller error:', updateUserError);
      return NextResponse.json(
        { error: updateUserError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Seller profile created. Awaiting admin verification.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create seller error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
