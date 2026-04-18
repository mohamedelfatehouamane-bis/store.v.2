import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can access finance metrics' }, { status: 403 })
    }

    const [transactionsRes, ordersRes] = await Promise.all([
      supabase.from('point_transactions').select('*'),
      supabase.from('orders').select('id, status, created_at'),
    ])

    if (transactionsRes.error || ordersRes.error) {
      console.error('Finance data load error:', transactionsRes.error ?? ordersRes.error)
      return NextResponse.json({ error: 'Unable to load finance metrics' }, { status: 500 })
    }

    const transactions = transactionsRes.data ?? []
    const completedOrders = (ordersRes.data ?? []).filter((order: any) => order.status === 'completed')

    const topupsTotal = transactions
      .filter((t: any) => t.transaction_type === 'topup' && t.status === 'completed')
      .reduce((sum: number, t: any) => sum + Number(t.amount ?? 0), 0)

    const withdrawalsTotal = transactions
      .filter((t: any) => t.transaction_type === 'withdrawal' && t.status === 'completed')
      .reduce((sum: number, t: any) => sum + Number(t.amount ?? 0), 0)

    const feesTotal = transactions
      .filter((t: any) => t.status === 'completed')
      .reduce((sum: number, t: any) => sum + Number(t.fee ?? 0), 0)

    const monthlyBreakdown = Array.from({ length: 6 }, (_, index) => {
      const date = new Date()
      date.setMonth(date.getMonth() - (5 - index))
      const month = date.getMonth()
      const year = date.getFullYear()
      const monthKey = date.toLocaleString('default', { month: 'short' })

      const monthTopups = transactions
        .filter((t: any) => {
          const created = new Date(t.created_at)
          return created.getMonth() === month && created.getFullYear() === year && t.transaction_type === 'topup' && t.status === 'completed'
        })
        .reduce((sum: number, t: any) => sum + Number(t.amount ?? 0), 0)

      const monthWithdrawals = transactions
        .filter((t: any) => {
          const created = new Date(t.created_at)
          return created.getMonth() === month && created.getFullYear() === year && t.transaction_type === 'withdrawal' && t.status === 'completed'
        })
        .reduce((sum: number, t: any) => sum + Number(t.amount ?? 0), 0)

      const monthFees = transactions
        .filter((t: any) => {
          const created = new Date(t.created_at)
          return created.getMonth() === month && created.getFullYear() === year && t.status === 'completed'
        })
        .reduce((sum: number, t: any) => sum + Number(t.fee ?? 0), 0)

      const monthOrdersCompleted = (ordersRes.data ?? []).filter((order: any) => {
        const created = new Date(order.created_at)
        return created.getMonth() === month && created.getFullYear() === year && order.status === 'completed'
      }).length

      return {
        month: monthKey,
        topups: monthTopups,
        withdrawals: monthWithdrawals,
        fees: monthFees,
        completedOrders: monthOrdersCompleted,
      }
    })

    return NextResponse.json({
      success: true,
      topupsTotal,
      withdrawalsTotal,
      feesTotal,
      completedOrdersTotal: completedOrders.length,
      monthlyBreakdown,
    })
  } catch (error) {
    console.error('Admin finance error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
