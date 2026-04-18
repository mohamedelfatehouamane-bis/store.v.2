import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { buildTrustSummary } from '@/lib/trust-score'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)

    let users: any[] = []

    const { data: usersWithReputation, error: usersWithReputationError } = await supabase
      .from('users')
      .select('id, username, avatar_url, role, is_active, rating, total_reviews, completed_orders, dispute_count')
      .eq('role', 'seller')
      .eq('is_active', true)
      .limit(limit * 4)

    if (usersWithReputationError && usersWithReputationError.code === '42703') {
      const { data: usersLegacy, error: usersLegacyError } = await supabase
        .from('users')
        .select('id, username, avatar_url, role, is_active')
        .eq('role', 'seller')
        .eq('is_active', true)
        .limit(limit * 4)

      if (usersLegacyError) {
        console.error('Seller ranking users fallback error:', usersLegacyError)
        return NextResponse.json({ error: usersLegacyError.message }, { status: 500 })
      }

      users = usersLegacy ?? []
    } else if (usersWithReputationError) {
      console.error('Seller ranking users error:', usersWithReputationError)
      return NextResponse.json({ error: usersWithReputationError.message }, { status: 500 })
    } else {
      users = usersWithReputation ?? []
    }

    if (users.length === 0) {
      return NextResponse.json({ success: true, sellers: [] })
    }

    const userIds = users.map((user: any) => String(user.id))

    const { data: profiles, error: profilesError } = await supabase
      .from('sellers')
      .select('user_id, verification_status, average_rating, total_tasks_completed')
      .in('user_id', userIds)
      .eq('verification_status', 'verified')

    if (profilesError) {
      console.error('Seller ranking profiles error:', profilesError)
      return NextResponse.json({ error: profilesError.message }, { status: 500 })
    }

    const profileByUserId = new Map((profiles ?? []).map((profile: any) => [String(profile.user_id), profile]))

    const ranked = users
      .map((user: any) => {
        const profile = profileByUserId.get(String(user.id))
        if (!profile) {
          return null
        }

        const rating = Number(user.rating ?? profile.average_rating ?? 0)
        const completedOrders = Number(user.completed_orders ?? profile.total_tasks_completed ?? 0)
        const disputeCount = Number(user.dispute_count ?? 0)
        const totalReviews = Number(user.total_reviews ?? 0)
        const trust = buildTrustSummary({
          rating,
          completed_orders: completedOrders,
          dispute_count: disputeCount,
        })

        return {
          id: String(user.id),
          username: user.username,
          avatar_url: user.avatar_url ?? null,
          rating,
          total_reviews: totalReviews,
          completed_orders: completedOrders,
          dispute_count: disputeCount,
          trust_score: trust.trust_score,
          trust_badge: trust.trust_badge,
          is_risky: trust.is_risky,
        }
      })
      .filter(Boolean) as any[]

    ranked.sort((a, b) => {
      if (b.trust_score !== a.trust_score) {
        return b.trust_score - a.trust_score
      }

      if (b.rating !== a.rating) {
        return b.rating - a.rating
      }

      return b.completed_orders - a.completed_orders
    })

    return NextResponse.json({
      success: true,
      sellers: ranked.slice(0, limit),
    })
  } catch (error) {
    console.error('Seller ranking API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
