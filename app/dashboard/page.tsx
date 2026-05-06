'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { normalizeStatus, ORDER_STATUS, isActiveOrderStatus } from '@/lib/order-status';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  TrendingUp,
  Users,
  Zap,
  Award,
  ShoppingBag,
  ClipboardList,
  MapPin,
  UserCircle,
  DollarSign,
  BarChart2,
} from 'lucide-react';

type OrderItem = {
  id: string;
  product_name: string;
  game_name: string;
  status: string;
  points_price: number;
  created_at: string;
};

type ProfileData = {
  total_points: number;
  is_verified?: boolean;
  verification_status?: string;
};

function statusBadgeClass(status: string) {
  switch (status) {
    case ORDER_STATUS.PENDING:
      return 'bg-yellow-50 text-yellow-700 border border-yellow-200';
    case ORDER_STATUS.IN_PROGRESS:
      return 'bg-blue-50 text-blue-700 border border-blue-200';
    case ORDER_STATUS.COMPLETED:
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case ORDER_STATUS.CANCELLED:
      return 'bg-red-50 text-red-700 border border-red-200';
    case ORDER_STATUS.DISPUTED:
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    default:
      return 'bg-slate-50 text-slate-700 border border-slate-200';
  }
}

export default function DashboardHome() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState({
    totalPoints: 0,
    activeOrders: 0,
    completedOrders: 0,
    totalUsers: 0,
    totalOrders: 0,
    revenue: 0,
  });
  const [recentOrders, setRecentOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const sellerStatus = profile?.verification_status || (profile?.is_verified ? 'verified' : 'pending');
  const sellerIsApproved = sellerStatus === 'verified' || sellerStatus === 'approved';

  const isCustomer = user?.role === 'customer';
  const isSeller = user?.role === 'seller';
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setError('You must be signed in to view dashboard data.');
      setLoading(false);
      return;
    }

    async function loadDashboard() {
      try {
        if (isAdmin) {
          const [usersRes, ordersRes] = await Promise.all([
            fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } }),
            fetch('/api/orders', { headers: { Authorization: `Bearer ${token}` } }),
          ]);

          if (!usersRes.ok) throw new Error('Unable to load users');
          if (!ordersRes.ok) throw new Error('Unable to load orders');

          const usersData = await usersRes.json();
          const ordersData = await ordersRes.json();
          const orders = (ordersData.orders ?? []).map((order: any) => ({
            ...order,
            status: normalizeStatus(order.status),
          }));

          const revenue = orders
            .filter((o: any) => o.status === ORDER_STATUS.COMPLETED)
            .reduce((sum: number, o: any) => sum + Number(o.points_price || 0), 0);

          setStats({
            totalPoints: 0,
            activeOrders: orders.filter((o: any) => isActiveOrderStatus(o.status)).length,
            completedOrders: orders.filter((o: any) => o.status === ORDER_STATUS.COMPLETED).length,
            totalUsers: Array.isArray(usersData.users) ? usersData.users.length : 0,
            totalOrders: orders.length,
            revenue,
          });
          setRecentOrders(orders.slice(0, 5));
        } else if (isSeller) {
          const [profileRes, sellerRes] = await Promise.all([
            fetch('/api/users/profile', { headers: { Authorization: `Bearer ${token}` } }),
            fetch('/api/orders?filter=my-tasks', { headers: { Authorization: `Bearer ${token}` } }),
          ]);

          if (!profileRes.ok) throw new Error('Unable to load profile');
          if (!sellerRes.ok) throw new Error('Unable to load orders');

          const profileData = await profileRes.json();
          const sellerData = await sellerRes.json();
          const myTasks = (sellerData.orders ?? []).map((order: any) => ({
            ...order,
            status: normalizeStatus(order.status),
          }));

          const earnings = myTasks
            .filter((o: any) => o.status === ORDER_STATUS.COMPLETED)
            .reduce((sum: number, o: any) => sum + Number(o.seller_earnings ?? o.points_price ?? 0), 0);

          setProfile(profileData.user ?? null);
          setStats({
            totalPoints: Number(profileData.user?.total_points ?? 0),
            activeOrders: myTasks.filter((o: any) => isActiveOrderStatus(o.status)).length,
            completedOrders: myTasks.filter((o: any) => o.status === ORDER_STATUS.COMPLETED).length,
            totalUsers: 0,
            totalOrders: myTasks.length,
            revenue: earnings,
          });
          setRecentOrders(myTasks.slice(0, 5));
        } else {
          const [profileRes, ordersRes] = await Promise.all([
            fetch('/api/users/profile', { headers: { Authorization: `Bearer ${token}` } }),
            fetch('/api/orders?filter=my-orders', { headers: { Authorization: `Bearer ${token}` } }),
          ]);

          if (!profileRes.ok) throw new Error('Unable to load profile');
          if (!ordersRes.ok) throw new Error('Unable to load orders');

          const profileData = await profileRes.json();
          const ordersData = await ordersRes.json();
          const orders = (ordersData.orders ?? []).map((order: any) => ({
            ...order,
            status: normalizeStatus(order.status),
          }));

          setProfile(profileData.user ?? null);
          setStats({
            totalPoints: Number(profileData.user?.total_points ?? 0),
            activeOrders: orders.filter((o: any) => isActiveOrderStatus(o.status)).length,
            completedOrders: orders.filter((o: any) => o.status === ORDER_STATUS.COMPLETED).length,
            totalUsers: 0,
            totalOrders: orders.length,
            revenue: 0,
          });
          setRecentOrders(orders.slice(0, 5));
        }
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Unable to load dashboard data');
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [user, isAdmin, isCustomer, isSeller]);

  return (
    <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
          Welcome back, {user?.username}!
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 sm:text-base">
          {isCustomer && 'Browse game services and track your orders.'}
          {isSeller && 'Manage your orders and grow your game services business.'}
          {isAdmin && 'Manage the MOHSTORE platform and review key metrics.'}
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Seller verification banner */}
      {isSeller && profile ? (
        sellerIsApproved ? (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
            ✅ Your seller account is approved. You can receive orders and manage tasks.
          </div>
        ) : profile.verification_status === 'rejected' ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            ❌ Your seller account was rejected. Contact support to review your application.
          </div>
        ) : (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-300">
            ⏳ Your seller account is waiting for admin approval. You will not receive tasks until approval is complete.
          </div>
        )
      ) : null}

      {/* Quick Actions */}
      <div className="mb-6 sm:mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {isCustomer && (
            <>
              <Link href="/dashboard/marketplace">
                <button className="flex w-full flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center transition hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600">
                  <ShoppingBag className="h-6 w-6 text-blue-600" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Browse Shop</span>
                </button>
              </Link>
              <Link href="/dashboard/orders">
                <button className="flex w-full flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center transition hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600">
                  <ClipboardList className="h-6 w-6 text-emerald-600" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">My Orders</span>
                </button>
              </Link>
              <Link href="/dashboard/orders">
                <button className="flex w-full flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center transition hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600">
                  <MapPin className="h-6 w-6 text-orange-600" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Track Order</span>
                </button>
              </Link>
              <Link href="/dashboard/profile">
                <button className="flex w-full flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center transition hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600">
                  <UserCircle className="h-6 w-6 text-purple-600" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Profile</span>
                </button>
              </Link>
            </>
          )}
          {isSeller && (
            <>
              <Link href="/dashboard/earnings">
                <button className="flex w-full flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center transition hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600">
                  <DollarSign className="h-6 w-6 text-emerald-600" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Withdraw Earnings</span>
                </button>
              </Link>
              <Link href="/dashboard/tasks">
                <button className="flex w-full flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center transition hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600">
                  <Zap className="h-6 w-6 text-blue-600" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">View Ongoing Orders</span>
                </button>
              </Link>
              <Link href="/dashboard/orders">
                <button className="flex w-full flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center transition hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600">
                  <ClipboardList className="h-6 w-6 text-emerald-600" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">View Completed Orders</span>
                </button>
              </Link>
              <Link href="/dashboard/marketplace">
                <button className="flex w-full flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center transition hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600">
                  <ShoppingBag className="h-6 w-6 text-purple-600" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Browse Shop</span>
                </button>
              </Link>
            </>
          )}
          {isAdmin && (
            <>
              <Link href="/dashboard/users">
                <button className="flex w-full flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center transition hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600">
                  <Users className="h-6 w-6 text-blue-600" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Manage Users</span>
                </button>
              </Link>
              <Link href="/dashboard/topup">
                <button className="flex w-full flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center transition hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600">
                  <DollarSign className="h-6 w-6 text-emerald-600" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Top-Up Requests</span>
                </button>
              </Link>
              <Link href="/dashboard/finance">
                <button className="flex w-full flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center transition hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600">
                  <BarChart2 className="h-6 w-6 text-orange-600" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Withdraw Requests</span>
                </button>
              </Link>
              <Link href="/dashboard/orders">
                <button className="flex w-full flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center transition hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600">
                  <ClipboardList className="h-6 w-6 text-purple-600" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Manage Orders</span>
                </button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className={`mb-6 grid grid-cols-1 gap-4 sm:mb-8 ${isSeller ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
        {isAdmin ? (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                <Users className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalUsers.toLocaleString()}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Registered platform users</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                <ClipboardList className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalOrders.toLocaleString()}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400">All-time platform orders</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.revenue.toLocaleString()} pts</div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Points value of completed orders</p>
              </CardContent>
            </Card>
          </>
        ) : isSeller ? (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
                <Award className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalPoints.toLocaleString()} pts</div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Withdrawable earnings</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Lifetime Earnings</CardTitle>
                <DollarSign className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.revenue.toLocaleString()} pts</div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Total earned from completed orders</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
                <Zap className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeOrders}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Orders in progress</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed Orders</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.completedOrders}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Successfully delivered</p>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Points Balance</CardTitle>
                <Award className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalPoints.toLocaleString()}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Current points available</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
                <Zap className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeOrders}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Open or in progress</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed Orders</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.completedOrders}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Successfully completed</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Recent Orders */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
          <CardDescription>
            {isCustomer
              ? 'Your latest game service orders'
              : isSeller
              ? 'Your most recent assigned orders'
              : 'Latest platform orders'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading latest activity...</div>
          ) : recentOrders.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No recent orders available</div>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900 dark:text-white">{order.product_name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{order.game_name}</p>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(order.status)}`}>
                      {order.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                    {order.points_price != null && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {Number(order.points_price).toLocaleString()} pts
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4">
            <Link href="/dashboard/orders">
              <Button variant="outline" className="w-full sm:w-auto">
                View All Orders
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
