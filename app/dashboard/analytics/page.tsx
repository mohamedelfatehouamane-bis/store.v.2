'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Users, ShoppingCart, DollarSign } from 'lucide-react';

type OrderItem = {
  id: string;
  game_name: string;
  points_price: number;
  created_at: string;
  status: string;
};

type UserItem = {
  id: string;
  role: string;
  created_at: string;
};

type TrendPoint = {
  date: string;
  earnings: number;
  approvedOrders: number;
};

type LeaderboardItem = {
  sellerId: string;
  username: string;
  avatar_url?: string | null;
  totalEarnings: number;
  completedOrders: number;
  rank: number;
  level?: string;
  badges?: string[];
  avgCompletionHours?: number;
  successRate?: number;
  nextLevel?: string;
  progressToNextLevel?: number;
};

export default function AnalyticsPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [podium, setPodium] = useState<LeaderboardItem[]>([]);
  const [sevenDayTrend, setSevenDayTrend] = useState<TrendPoint[]>([]);
  const [topCompleted, setTopCompleted] = useState<LeaderboardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [leaderboardError, setLeaderboardError] = useState('');

  const isAdmin = user?.role === 'admin';

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

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setError('Authentication required');
      return;
    }

    async function loadAnalytics() {
      setLoading(true);
      setError('');
      try {
        const [ordersRes, usersRes] = await Promise.all([
          fetch('/api/orders', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/users', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!ordersRes.ok || !usersRes.ok) {
          throw new Error('Unable to load analytics data');
        }

        const ordersData = await ordersRes.json();
        const usersData = await usersRes.json();

        setOrders(ordersData.orders ?? []);
        setUsers(usersData.users ?? []);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to fetch analytics data');
      } finally {
        setLoading(false);
      }
    }

    loadAnalytics();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setLeaderboardError('Authentication required');
      return;
    }

    async function loadLeaderboard() {
      try {
        const response = await fetch('/api/leaderboard', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data?.error || 'Unable to load leaderboard data');
        }

        const data = await response.json();
        setLeaderboard(data.leaderboard ?? []);
        setTopCompleted(data.topByCompleted ?? []);
        setPodium(data.podium ?? []);
        setSevenDayTrend(data.sevenDayTrend ?? []);
      } catch (err) {
        console.error(err);
        setLeaderboardError(err instanceof Error ? err.message : 'Failed to fetch leaderboard');
      }
    }

    loadLeaderboard();
  }, [isAdmin]);

  const approvedOrders = useMemo(
    () => orders.filter((order) => order.status === 'approved'),
    [orders]
  );

  const revenueTotal = useMemo(
    () => approvedOrders.reduce((sum, order) => sum + Number(order.points_price || 0), 0),
    [approvedOrders]
  );

  const completedTasks = useMemo(
    () => approvedOrders.length,
    [approvedOrders]
  );

  const statusBreakdown = useMemo(() => {
    const counts = orders.reduce((acc, order) => {
      const key = order.status || 'other';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const total = orders.length || 1;
    return [
      { status: 'Completed', count: counts.completed || 0, percentage: Math.round(((counts.completed || 0) / total) * 100), color: 'bg-green-500' },
      { status: 'In Progress', count: counts.in_progress || 0, percentage: Math.round(((counts.in_progress || 0) / total) * 100), color: 'bg-blue-500' },
      { status: 'Open', count: counts.open || 0, percentage: Math.round(((counts.open || 0) / total) * 100), color: 'bg-yellow-500' },
      { status: 'Cancelled', count: counts.cancelled || 0, percentage: Math.round(((counts.cancelled || 0) / total) * 100), color: 'bg-red-500' },
    ];
  }, [orders]);

  const monthlyStats = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - index));
      return date.toLocaleString('default', { month: 'short' });
    });

    return months.map((monthLabel, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - index));
      const month = date.getMonth();
      const year = date.getFullYear();
      const ordersForMonth = approvedOrders.filter((order) => {
        const created = new Date(order.created_at);
        return created.getMonth() === month && created.getFullYear() === year;
      });
      return {
        month: monthLabel,
        revenue: ordersForMonth.reduce((sum, order) => sum + Number(order.points_price || 0), 0),
        users: users.filter((userItem) => {
          const created = new Date(userItem.created_at);
          return created.getMonth() === month && created.getFullYear() === year;
        }).length,
        tasks: ordersForMonth.length,
      };
    });
  }, [orders, users]);

  const weeklyGrowth = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 4 }, (_, index) => {
      const start = new Date(today);
      start.setDate(today.getDate() - (7 * (3 - index)));
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      const customers = users.filter((item) => {
        const created = new Date(item.created_at);
        return item.role === 'customer' && created >= start && created < end;
      }).length;
      const sellers = users.filter((item) => {
        const created = new Date(item.created_at);
        return item.role === 'seller' && created >= start && created < end;
      }).length;
      return {
        week: `Week ${index + 1}`,
        customers,
        sellers,
      };
    });
  }, [users]);

  const gameBreakdown = useMemo(() => {
    const counts = orders.reduce((acc, order) => {
      acc[order.game_name] = (acc[order.game_name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const palette = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#6b7280', '#ec4899'];

    return Object.entries(counts).map(([name, value], index) => ({
      name,
      value,
      color: palette[index % palette.length],
    }));
  }, [orders]);

  if (!isAdmin) {
    return (
      <div className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">{t('analyticsDashboard')}</h1>
          <p className="text-slate-600 mt-2">{t('adminAccessAnalyticsRequired')}</p>
        </div>
        <Card className="text-center py-8">
          <p className="text-slate-600">{t('noPermissionAnalytics')}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">{t('analyticsDashboard')}</h1>
        <p className="text-slate-600 mt-2">{t('platformPerformanceMetrics')}</p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('totalRevenue')}</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${(revenueTotal / 1000).toFixed(0)}K</div>
            <p className="text-xs text-slate-600 mt-1">{t('lastSixMonths')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('activeUsers')}</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{users.length}</div>
            <p className="text-xs text-slate-600 mt-1">{t('totalRegisteredUsers')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('approvedTasks')}</CardTitle>
            <ShoppingCart className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{approvedOrders.length}</div>
            <p className="text-xs text-slate-600 mt-1">{t('approvedOrdersInSystem')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('avgTaskValue')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${approvedOrders.length ? Math.round(revenueTotal / approvedOrders.length) : 0}</div>
            <p className="text-xs text-slate-600 mt-1">{t('pointsPerApprovedOrder')}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>{t('sevenDayEarningsTrend')}</CardTitle>
            <CardDescription>{t('approvedOrderRevenueTrend')}</CardDescription>
          </CardHeader>
          <CardContent>
            {sevenDayTrend.length === 0 ? (
              <div className="py-12 text-center text-slate-600">{t('noTrendDataAvailable')}</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={sevenDayTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="earnings" stroke="#10b981" strokeWidth={2} name={t('earnings')} />
                  <Line type="monotone" dataKey="approvedOrders" stroke="#3b82f6" strokeWidth={2} name={t('completedOrdersLabel')} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('sellerPerformance')}</CardTitle>
            <CardDescription>{t('approvedOrdersRevenueLastWeek')}</CardDescription>
          </CardHeader>
          <CardContent>
            {sevenDayTrend.length === 0 ? (
              <div className="py-12 text-center text-slate-600">{t('noSellerPerformanceData')}</div>
            ) : (
              <div className="space-y-4">
                {sevenDayTrend.map((point) => (
                  <div key={point.date} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{point.date}</p>
                      <p className="text-xs text-slate-500">{point.approvedOrders} {t('approvedOrdersLabel')}</p>
                    </div>
                    <p className="text-lg font-semibold text-slate-900">{point.earnings.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-8 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>{t('sellerLeaderboard')}</CardTitle>
            <CardDescription>{t('topSellersByEarnings')}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {leaderboardError ? (
              <div className="py-12 text-center text-slate-600">{leaderboardError}</div>
            ) : leaderboard.length === 0 ? (
              <div className="py-12 text-center text-slate-600">{t('noSellerLeaderboardData')}</div>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="border-b px-4 py-3 font-medium text-slate-600">{t('rank')}</th>
                    <th className="border-b px-4 py-3 font-medium text-slate-600">{t('sellerLabel')}</th>
                    <th className="border-b px-4 py-3 font-medium text-slate-600">{t('earnings')}</th>
                    <th className="border-b px-4 py-3 font-medium text-slate-600">{t('level')}</th>
                    <th className="border-b px-4 py-3 font-medium text-slate-600">{t('badges')}</th>
                    <th className="border-b px-4 py-3 font-medium text-slate-600">{t('completedOrdersLabel')}</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((item) => (
                    <tr key={item.sellerId} className="border-b last:border-b-0 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">#{item.rank}</td>
                      <td className="px-4 py-3 text-slate-900">{item.username}</td>
                      <td className="px-4 py-3 text-slate-900">{item.totalEarnings.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-900">{item.level ?? t('beginner')}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {(item.badges ?? []).length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {item.badges?.map((badge) => (
                              <span
                                key={badge}
                                className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold ${getBadgeClass(badge)}`}
                              >
                                {badge}
                              </span>
                            ))}
                          </div>
                        ) : (
                          t('none')
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{item.completedOrders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('topSellersByCompletedOrders')}</CardTitle>
            <CardDescription>{t('gamifySellerPerformance')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topCompleted.length === 0 ? (
              <div className="py-12 text-center text-slate-600">{t('noCompletedOrderLeaderboardYet')}</div>
            ) : (
              topCompleted.slice(0, 5).map((item) => (
                <div key={item.sellerId} className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                  <div>
                    <p className="font-medium text-slate-900">{item.username}</p>
                    <p className="text-sm text-slate-600">{item.completedOrders} {t('completedShort')}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    #{item.rank}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>{t('revenueUserGrowth')}</CardTitle>
            <CardDescription>{t('lastSixMonths')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="revenue" fill="#10b981" name={t('totalRevenue')} />
                <Bar dataKey="users" fill="#3b82f6" name={t('totalUsers')} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('userGrowthByType')}</CardTitle>
            <CardDescription>{t('weeklyRegistrationBreakdown')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={weeklyGrowth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="customers" stroke="#3b82f6" strokeWidth={2} name={t('customers')} />
                <Line type="monotone" dataKey="sellers" stroke="#10b981" strokeWidth={2} name={t('sellers')} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{t('popularGames')}</CardTitle>
            <CardDescription>{t('taskDistributionByGame')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={gameBreakdown}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {gameBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('taskStatusOverview')}</CardTitle>
            <CardDescription>{t('currentOrderStatusDistribution')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {statusBreakdown.map((item) => (
                <div key={item.status}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-slate-900">{item.status}</p>
                    <p className="text-sm text-slate-600">{item.count} ({item.percentage}%)</p>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div className={`${item.color} h-2 rounded-full`} style={{ width: `${item.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
