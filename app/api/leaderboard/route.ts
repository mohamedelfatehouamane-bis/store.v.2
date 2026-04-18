import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { getSellerLevel, getNextLevelInfo } from '@/lib/leaderboard-config'

const cacheHeaders = {
  'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=30',
}

const APPROVED_STATUS = 'approved'
const TERMINAL_STATUSES = ['approved', 'cancelled']

function buildResponse(payload: any, status = 200) {
  return NextResponse.json(payload, { status, headers: cacheHeaders })
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return buildResponse({ error: 'Unauthorized' }, 401)
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth) {
      return buildResponse({ error: 'Unauthorized' }, 401)
    }

    const sellersRes = await supabase
      .from('users')
      .select('id, username, avatar_url')
      .eq('role', 'seller')

    if (sellersRes.error) {
      console.error('Leaderboard seller lookup error:', sellersRes.error)
      return buildResponse({ error: 'Unable to load leaderboard data' }, 500)
    }

    const sellerIds = (sellersRes.data ?? []).map((seller: any) => seller.id)

    let transactionsRes: any = { data: [], error: null }
    if (sellerIds.length) {
      transactionsRes = await supabase
        .from('point_transactions')
        .select('user_id, amount')
        .in('user_id', sellerIds)
        .eq('transaction_type', 'order')
        .eq('status', 'completed')
        .gt('amount', 0)

      // Backward compatibility for schemas using `type` instead of
      // `transaction_type`, and for enums that don't include "order".
      if (transactionsRes.error && ['42703', 'PGRST204', '22P02'].includes(transactionsRes.error.code)) {
        transactionsRes = await supabase
          .from('point_transactions')
          .select('user_id, amount')
          .in('user_id', sellerIds)
          .eq('type', 'order')
          .eq('status', 'completed')
          .gt('amount', 0)
      }

      // Final fallback: drop transaction type filter entirely.
      if (transactionsRes.error && ['42703', 'PGRST204', '22P02'].includes(transactionsRes.error.code)) {
        transactionsRes = await supabase
          .from('point_transactions')
          .select('user_id, amount')
          .in('user_id', sellerIds)
          .eq('status', 'completed')
          .gt('amount', 0)
      }
    }

    const ordersRes = await supabase
      .from('orders')
      .select('assigned_seller_id, status, points_amount, created_at, completed_at')
      .in('status', TERMINAL_STATUSES)

    if (transactionsRes.error || ordersRes.error) {
      console.error('Leaderboard load error:', transactionsRes.error ?? ordersRes.error)
      return buildResponse({ error: 'Unable to load leaderboard data' }, 500)
    }

    const sellerEarnings = new Map<string, number>()
    ;(transactionsRes.data ?? []).forEach((transaction: any) => {
      if (!transaction.user_id) return
      const current = sellerEarnings.get(transaction.user_id) ?? 0
      sellerEarnings.set(transaction.user_id, current + Number(transaction.amount ?? 0))
    })

    const approvedOrders = new Map<string, number>()
    const terminalOrders = new Map<string, number>()
    const cancelledOrders = new Map<string, number>()
    const completionTimeMs = new Map<string, number>()

    ;(ordersRes.data ?? []).forEach((order: any) => {
      if (!order.assigned_seller_id || !order.status) return

      const sellerId = order.assigned_seller_id
      if (TERMINAL_STATUSES.includes(order.status)) {
        terminalOrders.set(sellerId, (terminalOrders.get(sellerId) ?? 0) + 1)
      }

      if (order.status === APPROVED_STATUS) {
        approvedOrders.set(sellerId, (approvedOrders.get(sellerId) ?? 0) + 1)

        if (order.completed_at && order.created_at) {
          const createdAt = new Date(order.created_at).getTime()
          const completedAt = new Date(order.completed_at).getTime()
          if (!Number.isNaN(createdAt) && !Number.isNaN(completedAt) && completedAt > createdAt) {
            completionTimeMs.set(
              sellerId,
              (completionTimeMs.get(sellerId) ?? 0) + (completedAt - createdAt)
            )
          }
        }
      }

      if (order.status === 'cancelled') {
        cancelledOrders.set(sellerId, (cancelledOrders.get(sellerId) ?? 0) + 1)
      }
    })

    const leaderboard = (sellersRes.data ?? []).map((seller: any) => {
      const earnings = Number(sellerEarnings.get(seller.id) ?? 0)
      const completedCount = approvedOrders.get(seller.id) ?? 0
      const totalCount = terminalOrders.get(seller.id) ?? 0
      const avgCompletionHours = completedCount > 0
        ? (completionTimeMs.get(seller.id) ?? 0) / completedCount / (1000 * 60 * 60)
        : null
      const successRate = totalCount > 0 ? completedCount / totalCount : null
      const level = getSellerLevel(completedCount, earnings)

      return {
        sellerId: seller.id,
        username: seller.username ?? 'Anonymous Seller',
        avatar_url: seller.avatar_url ?? null,
        totalEarnings: earnings,
        completedOrders: completedCount,
        totalOrders: totalCount,
        avgCompletionHours: avgCompletionHours !== null ? Number(avgCompletionHours.toFixed(1)) : null,
        successRate: successRate !== null ? Number((successRate * 100).toFixed(0)) : null,
        level,
        badges: [],
      }
    })

    const podium = leaderboard
      .slice()
      .sort((a, b) => b.totalEarnings - a.totalEarnings || b.completedOrders - a.completedOrders)
      .slice(0, 3)

    const completionFast = leaderboard
      .slice()
      .filter((item) => item.avgCompletionHours !== null)
      .sort((a, b) => (a.avgCompletionHours ?? Infinity) - (b.avgCompletionHours ?? Infinity))
      .slice(0, 3)

    const deliveryWinners = new Set<string>(completionFast.map((item) => item.sellerId))

    const rankedByEarnings = leaderboard
      .slice()
      .sort((a, b) => b.totalEarnings - a.totalEarnings || b.completedOrders - a.completedOrders)
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }))
      .map((item) => ({
        ...item,
        badges: [
          ...(item.rank <= 3 ? ['Top Seller'] : []),
          ...(deliveryWinners.has(item.sellerId) ? ['Fast Delivery'] : []),
          ...(item.successRate !== null && item.successRate > 90 && item.completedOrders >= 10 ? ['Trusted'] : []),
        ],
      }))

    const topByCompleted = rankedByEarnings
      .slice()
      .sort((a, b) => b.completedOrders - a.completedOrders || b.totalEarnings - a.totalEarnings)

    const sevenDayTrend = Array.from({ length: 7 }, (_, index) => {
      const date = new Date()
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() - (6 - index))
      const dateKey = date.toISOString().slice(0, 10)
      const dayOrders = (ordersRes.data ?? []).filter((order: any) => {
        if (order.status !== APPROVED_STATUS || !order.assigned_seller_id) return false
        const createdDate = new Date(order.created_at).toISOString().slice(0, 10)
        return createdDate === dateKey
      })
      return {
        date: dateKey,
        earnings: dayOrders.reduce((sum, order: any) => sum + Number(order.points_amount ?? 0), 0),
        approvedOrders: dayOrders.length,
      }
    })

    if (auth.role === 'admin') {
      return buildResponse({
        success: true,
        leaderboard: rankedByEarnings,
        topByCompleted,
        podium,
        sevenDayTrend,
      })
    }

    if (auth.role === 'seller') {
      const sellerStatsBase = rankedByEarnings.find((item) => item.sellerId === auth.id)
      const defaultStats = {
        sellerId: auth.id,
        username: auth.username ?? 'You',
        totalEarnings: 0,
        completedOrders: 0,
        totalOrders: 0,
        avgCompletionHours: null,
        successRate: null,
        level: 'Beginner',
        badges: [],
        rank: rankedByEarnings.length + 1,
      }
      const sellerStats = sellerStatsBase ?? defaultStats
      const nextLevelInfo = getNextLevelInfo(sellerStats.completedOrders, sellerStats.totalEarnings)

      return buildResponse({
        success: true,
        sellerStats: {
          ...sellerStats,
          nextLevel: nextLevelInfo.nextLevel,
          progressToNextLevel: nextLevelInfo.progressPercent,
          nextLevelLabel: nextLevelInfo.progressLabel,
          remainingOrders: nextLevelInfo.remainingOrders,
          remainingEarnings: nextLevelInfo.remainingEarnings,
        },
        podium,
        sevenDayTrend,
      })
    }

    return buildResponse({ error: 'Only sellers and admins can access leaderboard data' }, 403)
  } catch (error) {
    console.error('Leaderboard error:', error)
    return buildResponse({ error: 'Internal server error' }, 500)
  }
}
