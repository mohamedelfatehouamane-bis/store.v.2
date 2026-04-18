'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, DollarSign, Calendar, Award, Shield, Zap } from 'lucide-react';

type OrderItem = {
  id: string;
  product_name: string;
  points_price: number;
  status: string;
  created_at: string;
};

type TrendPoint = {
  date: string;
  earnings: number;
  approvedOrders: number;
};

type ProfileData = {
  balance: number;
  total_points: number;
};

type WithdrawalItem = {
  id: string;
  amount: number;
  fee_percentage?: number;
  final_amount?: number;
  payment_name?: string | null;
  status: string;
  created_at: string;
  processed_at: string | null;
  transaction_id: string | null;
};

type PodiumItem = {
  sellerId: string;
  username: string;
  avatar_url?: string | null;
  rank: number;
  totalEarnings: number;
  completedOrders: number;
  level: string;
  badges: string[];
};

type SellerLeaderboardStats = {
  rank: number | null;
  totalEarnings: number;
  completedOrders: number;
  totalOrders?: number;
  level: string;
  badges: string[];
  avgCompletionHours: number | null;
  successRate: number | null;
  nextLevel?: string | null;
  progressToNextLevel?: number | null;
  nextLevelLabel?: string | null;
  remainingOrders?: number;
  remainingEarnings?: number;
};

export default function EarningsPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [sellerStats, setSellerStats] = useState<SellerLeaderboardStats | null>(null);
  const [podium, setPodium] = useState<PodiumItem[]>([]);
  const [sevenDayTrend, setSevenDayTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestingWithdrawal, setRequestingWithdrawal] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const isSeller = user?.role === 'seller';

  const loadEarnings = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const [ordersRes, profileRes, withdrawalsRes] = await Promise.all([
        fetch('/api/orders?filter=my-tasks', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/users/profile', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/withdrawals', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!ordersRes.ok || !profileRes.ok || !withdrawalsRes.ok) {
        throw new Error('Unable to load earnings data');
      }

      const ordersData = await ordersRes.json();
      const profileData = await profileRes.json();
      const withdrawalsData = await withdrawalsRes.json();

      setOrders(ordersData.orders ?? []);
      setProfile(profileData.user ?? null);
      setWithdrawals(withdrawalsData.withdrawals ?? []);

      const leaderboardRes = await fetch('/api/leaderboard', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (leaderboardRes.ok) {
        const leaderboardData = await leaderboardRes.json();
        setSellerStats(leaderboardData.sellerStats ?? null);
        setPodium(leaderboardData.podium ?? []);
        setSevenDayTrend(leaderboardData.sevenDayTrend ?? []);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to fetch earnings data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSeller) {
      return;
    }

    loadEarnings();
  }, [isSeller]);

  const handleRequestWithdrawal = async () => {
    setError('')
    setSuccessMessage('')

    if (!isSeller) {
      setError('Only sellers can request withdrawals.')
      return
    }

    const token = localStorage.getItem('auth_token')
    if (!token) {
      setError('Authentication required')
      return
    }

    const amountInput = window.prompt('Enter withdrawal amount (whole points):')
    if (!amountInput) {
      return
    }

    const amount = Number(amountInput)
    if (!Number.isInteger(amount) || amount <= 0) {
      setError('Enter a valid whole amount for withdrawal.')
      return
    }

    const bankAccount = window.prompt('Enter your bank account details for payout (optional):')
    const paymentName = window.prompt('Enter payment name/method (e.g. Vodafone Cash, Bank Transfer):')

    try {
      setRequestingWithdrawal(true)
      const response = await fetch('/api/withdrawals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount,
          payment_name: paymentName?.trim() || undefined,
          bank_account_info: bankAccount?.trim() || undefined,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to submit withdrawal request')
      }

      setSuccessMessage(data.message || 'Withdrawal request submitted.')
      await loadEarnings()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to submit withdrawal request')
    } finally {
      setRequestingWithdrawal(false)
    }
  }

  const approvedOrders = useMemo(
    () => orders.filter((order) => order.status === 'approved'),
    [orders]
  );

  const monthlyStats = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const monthDate = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1);
      const label = monthDate.toLocaleString('default', { month: 'short' });
      const monthOrders = approvedOrders.filter((order) => {
        const created = new Date(order.created_at);
        return created.getFullYear() === monthDate.getFullYear() && created.getMonth() === monthDate.getMonth();
      });
      return {
        month: label,
        earned: monthOrders.reduce((sum, order) => sum + Number(order.points_price || 0), 0),
        pending: monthOrders.filter((order) => order.status === 'open').reduce((sum, order) => sum + Number(order.points_price || 0), 0),
        released: monthOrders.reduce((sum, order) => sum + Number(order.points_price || 0), 0),
      };
    });
  }, [approvedOrders]);

  const weeklyTrend = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 4 }, (_, index) => {
      const start = new Date(today);
      start.setDate(today.getDate() - 7 * (3 - index));
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      const earnings = approvedOrders
        .filter((order) => {
          const created = new Date(order.created_at);
          return created >= start && created < end;
        })
        .reduce((sum, order) => sum + Number(order.points_price || 0), 0);
      return {
        month: `Week ${index + 1}`,
        earnings,
      };
    });
  }, [approvedOrders]);

  const totalEarned = approvedOrders.reduce((sum, order) => sum + Number(order.points_price || 0), 0);
  const totalReleased = approvedOrders.reduce((sum, order) => sum + Number(order.points_price || 0), 0);
  const pendingAmount = orders.filter((order) => order.status === 'open').reduce((sum, order) => sum + Number(order.points_price || 0), 0);

  const recentTransactions = orders.slice(0, 4).map((order) => ({
    id: order.id,
    task: order.product_name,
    amount: order.points_price,
    status: order.status,
    date: new Date(order.created_at).toLocaleDateString(),
  }));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'completed':
        return 'bg-green-50 text-green-700 border-green-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getBadgeClass = (badge: string) => {
    switch (badge) {
      case 'Top Seller':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Fast Delivery':
        return 'bg-sky-100 text-sky-800 border-sky-200';
      case 'Trusted':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  if (!isSeller) {
    return (
      <div className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Earnings Dashboard</h1>
          <p className="text-slate-600 mt-2">Seller access is required to view earnings.</p>
        </div>
        <Card className="text-center py-8">
          <p className="text-slate-600">You do not have permission to view this data.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Earnings Dashboard</h1>
        <p className="text-slate-600 mt-2">Track your income and completed orders from the backend.</p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Podium</CardTitle>
          <CardDescription>Top 3 sellers this cycle</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {podium.length === 0 ? (
              <div className="col-span-full rounded-lg border border-slate-200 bg-slate-50 px-6 py-10 text-center text-slate-600">
                No podium data yet.
              </div>
            ) : (
              podium.map((entry) => (
                <div
                  key={entry.sellerId}
                  className={`rounded-2xl border p-5 shadow-sm transition ${
                    entry.sellerId === user?.id ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.2em] text-slate-500">#{entry.rank}</p>
                      <p className="text-lg font-semibold text-slate-900">{entry.username}</p>
                    </div>
                    {entry.sellerId === user?.id ? (
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
                        You
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 space-y-2">
                    <p className="text-sm text-slate-600">Earnings</p>
                    <p className="text-2xl font-bold text-slate-900">{entry.totalEarnings.toLocaleString()}</p>
                    <p className="text-sm text-slate-500">{entry.completedOrders} approved orders</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Leaderboard Rank</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{sellerStats?.rank ? `#${sellerStats.rank}` : '-'}</div>
            <p className="text-xs text-slate-600 mt-1">Your current seller rank by earnings</p>
            {sellerStats?.badges?.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {sellerStats.badges.map((badge) => (
                  <span
                    key={badge}
                    className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${getBadgeClass(badge)}`}
                  >
                    {badge}
                  </span>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{sellerStats?.totalEarnings.toLocaleString() ?? '0'}</div>
            <p className="text-xs text-slate-600 mt-1">Approved order payouts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Completed Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{sellerStats?.completedOrders ?? 0}</div>
            <p className="text-xs text-slate-600 mt-1">Tasks completed on the platform</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Progress to next level</CardTitle>
          <CardDescription>
            Track the next milestone for your seller status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">Current level</p>
              <p className="text-xl font-semibold text-slate-900">{sellerStats?.level ?? 'Beginner'}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">Next level</p>
              <p className="text-xl font-semibold text-slate-900">{sellerStats?.nextLevel ?? 'Elite'}</p>
            </div>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-500"
              style={{ width: `${sellerStats?.progressToNextLevel ?? 0}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-slate-600">
            {sellerStats?.nextLevelLabel ?? 'Keep completing approved orders to level up.'}
          </p>
          {sellerStats?.remainingOrders !== undefined || sellerStats?.remainingEarnings !== undefined ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Orders to reach next level</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{sellerStats?.remainingOrders ?? 0}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Earnings to reach next level</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{sellerStats?.remainingEarnings?.toLocaleString() ?? 0}</p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earned</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${totalEarned.toLocaleString()}</div>
            <p className="text-xs text-slate-600 mt-1">Points value from all assigned orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Released</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${totalReleased.toLocaleString()}</div>
            <p className="text-xs text-slate-600 mt-1">Completed orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Calendar className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${pendingAmount.toLocaleString()}</div>
            <p className="text-xs text-slate-600 mt-1">Awaiting completion</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Earnings Trend</CardTitle>
            <CardDescription>Last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="earned" fill="#3b82f6" name="Earned" />
                <Bar dataKey="released" fill="#10b981" name="Released" />
                <Bar dataKey="pending" fill="#f59e0b" name="Pending" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This Month Trend</CardTitle>
            <CardDescription>Weekly earnings</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={weeklyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="earnings" stroke="#3b82f6" strokeWidth={2} name="Earnings" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Your latest assigned orders</CardDescription>
          </div>
          <Button variant="outline">View All</Button>
        </CardHeader>
        <CardContent>
          {(loading && !error) ? (
            <div className="py-12 text-center text-slate-500">Loading transactions...</div>
          ) : recentTransactions.length > 0 ? (
            <div className="space-y-4">
              {recentTransactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{transaction.task}</p>
                    <p className="text-sm text-slate-600">{transaction.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900">${transaction.amount.toLocaleString()}</p>
                    <span className={`inline-block mt-1 px-2 py-1 rounded text-xs font-medium border ${getStatusColor(transaction.status)}`}>
                      {transaction.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-600">No earnings transactions available.</div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Withdraw Earnings</CardTitle>
          <CardDescription>Request a withdrawal to your bank account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm text-slate-600 mb-2">Available Balance</p>
              <p className="text-3xl font-bold text-green-600">{profile?.balance?.toLocaleString() ?? '0'}</p>
            </div>
            <Button
              size="lg"
              className="bg-green-600 hover:bg-green-700"
              onClick={handleRequestWithdrawal}
              disabled={requestingWithdrawal}
            >
              {requestingWithdrawal ? 'Submitting...' : 'Request Withdrawal'}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Withdrawal History</CardTitle>
          <CardDescription>Submitted withdrawal requests and statuses</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-slate-500">Loading withdrawal history...</div>
          ) : withdrawals.length > 0 ? (
            <div className="space-y-4">
              {withdrawals.map((withdrawal) => (
                <div key={withdrawal.id} className="flex flex-col gap-2 p-4 border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-900">Request #{withdrawal.id}</p>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                        withdrawal.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-700'
                          : withdrawal.status === 'rejected'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {withdrawal.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                    <span>Amount: {withdrawal.amount.toLocaleString()}</span>
                    {withdrawal.fee_percentage !== undefined && (
                      <span>Fee: {withdrawal.fee_percentage}%</span>
                    )}
                    {withdrawal.final_amount !== undefined && (
                      <span>Final: {withdrawal.final_amount.toLocaleString()}</span>
                    )}
                    {withdrawal.payment_name && (
                      <span>Payment: {withdrawal.payment_name}</span>
                    )}
                    <span>Requested: {new Date(withdrawal.created_at).toLocaleDateString()}</span>
                    {withdrawal.processed_at && (
                      <span>Processed: {new Date(withdrawal.processed_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-600">
              No withdrawal requests have been submitted yet.
            </div>
          )}
        </CardContent>
      </Card>    </div>
  );
}
