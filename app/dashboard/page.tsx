'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { TrendingUp, Users, Zap, Award } from 'lucide-react';

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

export default function DashboardHome() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState({
    totalPoints: 0,
    activeTasks: 0,
    completedOrders: 0,
    totalUsers: 0,
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
    if (!user) {
      return;
    }

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
            fetch('/api/users', {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch('/api/orders', {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ]);

          if (!usersRes.ok) {
            throw new Error('Unable to load users');
          }
          if (!ordersRes.ok) {
            throw new Error('Unable to load orders');
          }

          const usersData = await usersRes.json();
          const ordersData = await ordersRes.json();
          const orders = ordersData.orders ?? [];

          const revenue = orders.reduce(
            (sum: number, order: any) => sum + Number(order.points_price || 0),
            0
          );

          setStats({
            totalPoints: 0,
            activeTasks: orders.filter((order: any) =>
              ['open', 'in_progress'].includes(order.status)
            ).length,
            completedOrders: orders.filter((order: any) => order.status === 'completed')
              .length,
            totalUsers: Array.isArray(usersData.users) ? usersData.users.length : 0,
            revenue,
          });
          setRecentOrders(orders.slice(0, 3));
        } else if (isSeller) {
          const [profileRes, availableRes, sellerRes] = await Promise.all([
            fetch('/api/users/profile', {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch('/api/orders?filter=available', {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch('/api/orders?filter=my-tasks', {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ]);

          if (!profileRes.ok) {
            throw new Error('Unable to load profile');
          }
          if (!availableRes.ok || !sellerRes.ok) {
            throw new Error('Unable to load orders');
          }

          const profileData = await profileRes.json();
          const availableData = await availableRes.json();
          const sellerData = await sellerRes.json();
          const availableOrders = availableData.orders ?? [];
          const myTasks = sellerData.orders ?? [];

          const revenue = myTasks.reduce(
            (sum: number, order: any) => sum + Number(order.points_price || 0),
            0
          );

          setProfile(profileData.user ?? null);
          setStats({
            totalPoints: Number(profileData.user?.total_points ?? 0),
            activeTasks: availableOrders.length,
            completedOrders: myTasks.filter((order: any) => order.status === 'completed').length,
            totalUsers: 0,
            revenue,
          });
          setRecentOrders(availableOrders.slice(0, 3));
        } else {
          const [profileRes, ordersRes] = await Promise.all([
            fetch('/api/users/profile', {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch('/api/orders?filter=my-orders', {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ]);

          if (!profileRes.ok) {
            throw new Error('Unable to load profile');
          }
          if (!ordersRes.ok) {
            throw new Error('Unable to load orders');
          }

          const profileData = await profileRes.json();
          const ordersData = await ordersRes.json();
          const orders = ordersData.orders ?? [];

          setProfile(profileData.user ?? null);
          setStats({
            totalPoints: Number(profileData.user?.total_points ?? 0),
            activeTasks: orders.filter((order: any) =>
              ['open', 'in_progress'].includes(order.status)
            ).length,
            completedOrders: orders.filter((order: any) => order.status === 'completed').length,
            totalUsers: 0,
            revenue: orders.reduce(
              (sum: number, order: any) => sum + Number(order.points_price || 0),
              0
            ),
          });
          setRecentOrders(orders.slice(0, 3));
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

  const recentLabel = isCustomer
    ? 'Recent Orders'
    : isSeller
    ? 'Available Tasks'
    : 'Recent Activity';
  const recentDescription = isCustomer
    ? 'Your latest game service orders'
    : isSeller
    ? 'Tasks currently available to accept'
    : 'Latest platform activity';

  return (
    <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Welcome back, {user?.username}!</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          {isCustomer && 'Find professional game service providers and post your tasks'}
          {isSeller && 'Manage your available tasks and grow your game services business'}
          {isAdmin && 'Manage the MOHSTORE platform and review key metrics'}
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isSeller && profile ? (
        sellerIsApproved ? (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            ✅ Your seller account is approved. You can receive orders and manage tasks.
          </div>
        ) : profile.verification_status === 'rejected' ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            ❌ Your seller account was rejected. Contact support to review your application.
          </div>
        ) : (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            ⏳ Your seller account is waiting for admin approval. You will not receive tasks until approval is complete.
          </div>
        )
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {isAdmin ? 'Total Users' : 'Points Balance'}
            </CardTitle>
            <Award className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isAdmin ? stats.totalUsers : stats.totalPoints.toLocaleString()}
            </div>
            <p className="text-xs text-slate-600">
              {isAdmin ? 'Registered users' : 'Current points available'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
            <Zap className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeTasks}</div>
            <p className="text-xs text-slate-600">Open or in progress orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {isCustomer ? 'Completed Orders' : isAdmin ? 'Completed Orders' : 'Assigned Orders'}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedOrders}</div>
            <p className="text-xs text-slate-600">
              {isCustomer ? 'Successfully completed' : isAdmin ? 'Total completed' : 'Accepted or completed'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <Users className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.revenue.toLocaleString()}</div>
            <p className="text-xs text-slate-600">Total points value of fetched orders</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{recentLabel}</CardTitle>
              <CardDescription>{recentDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="p-4 text-center text-sm text-slate-500 sm:p-8">Loading latest activity...</div>
              ) : recentOrders.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-600 sm:p-8">No recent orders available</div>
              ) : (
                <div className="space-y-4">
                  {recentOrders.map((order) => (
                    <div
                      key={order.id}
                      className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{order.product_name}</p>
                        <p className="text-sm text-slate-600">{order.game_name}</p>
                      </div>
                      <div className="text-left sm:text-right">
                        <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700">
                          {order.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Button variant="outline" className="mt-4 w-full sm:w-auto">
                {isCustomer ? 'View All Orders' : isSeller ? 'Browse Tasks' : 'View All'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isCustomer && (
                <>
                  <Link href="/dashboard/marketplace">
                    <Button variant="outline" className="w-full justify-start">
                      Find Services
                    </Button>
                  </Link>
                  <Link href="/dashboard/post-task">
                    <Button className="w-full justify-start">
                      Post New Task
                    </Button>
                  </Link>
                </>
              )}
              {isSeller && (
                <>
                  <Link href="/dashboard/tasks">
                    <Button className="w-full justify-start">
                      Browse Tasks
                    </Button>
                  </Link>
                  <Link href="/dashboard/profile">
                    <Button variant="outline" className="w-full justify-start">
                      Complete Profile
                    </Button>
                  </Link>
                </>
              )}
              {isAdmin && (
                <>
                  <Link href="/dashboard/users">
                    <Button variant="outline" className="w-full justify-start">
                      Manage Users
                    </Button>
                  </Link>
                  <Link href="/dashboard/analytics">
                    <Button variant="outline" className="w-full justify-start">
                      View Analytics
                    </Button>
                  </Link>
                </>
              )}
            </CardContent>
          </Card>

         
        </div>
      </div>
    </div>
  );
}
