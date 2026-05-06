'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { useAuth } from '@/lib/auth-context';

import {
  normalizeStatus,
  ORDER_STATUS,
  isActiveOrderStatus,
} from '@/lib/order-status';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import {
  DollarSign,
  Zap,
  ClipboardList,
  ShoppingBag,
} from 'lucide-react';

type OrderItem = {
  id: string;
  product_name?: string;
  game_name?: string;
  status: string;
  points_price: number;
  created_at: string;
  seller_earnings?: number;
};

type ProfileData = {
  total_points: number;
  status?: string;
  role?: string;
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

    default:
      return 'bg-slate-50 text-slate-700 border border-slate-200';
  }
}

export default function DashboardPage() {
  const { user } = useAuth();

  const [profile, setProfile] =
    useState<ProfileData | null>(null);

  const [recentOrders, setRecentOrders] =
    useState<OrderItem[]>([]);

  const [stats, setStats] = useState({
    totalPoints: 0,
    activeOrders: 0,
    completedOrders: 0,
    revenue: 0,
  });

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const isSeller =
    user?.role === 'seller';

  const sellerIsApproved =
    user?.role === 'seller' &&
    profile?.status === 'approved';

  useEffect(() => {
    if (!user) return;

    const token =
      localStorage.getItem('auth_token');

    if (!token) {
      setLoading(false);
      return;
    }

    async function loadDashboard() {
      try {
        const [profileRes, ordersRes] =
          await Promise.all([
            fetch('/api/users/profile', {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }),

            fetch(
              '/api/orders?filter=my-tasks',
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            ),
          ]);

        if (!profileRes.ok) {
          throw new Error(
            'Unable to load profile'
          );
        }

        if (!ordersRes.ok) {
          throw new Error(
            'Unable to load orders'
          );
        }

        const profileData =
          await profileRes.json();

        const ordersData =
          await ordersRes.json();

        const orders = (
          ordersData.orders ?? []
        ).map((order: any) => ({
          ...order,
          status: normalizeStatus(
            order.status
          ),
        }));

        const earnings = orders
          .filter(
            (o: any) =>
              o.status ===
              ORDER_STATUS.COMPLETED
          )
          .reduce(
            (sum: number, o: any) =>
              sum +
              Number(
                o.seller_earnings ??
                  o.points_price ??
                  0
              ),
            0
          );

        setProfile(profileData.user);

        setRecentOrders(
          orders.slice(0, 5)
        );

        setStats({
          totalPoints: Number(
            profileData.user
              ?.total_points ?? 0
          ),

          activeOrders: orders.filter(
            (o: any) =>
              isActiveOrderStatus(
                o.status
              )
          ).length,

          completedOrders:
            orders.filter(
              (o: any) =>
                o.status ===
                ORDER_STATUS.COMPLETED
            ).length,

          revenue: earnings,
        });
      } catch (err) {
        console.error(err);

        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load dashboard'
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-white">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      {/* HEADER */}

      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
          Welcome back, {user?.username}!
        </h1>

        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 sm:text-base">
          Manage your orders and grow your
          game services business.
        </p>
      </div>

      {/* SELLER STATUS */}

      {isSeller && profile ? (
        sellerIsApproved ? (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
            ✅ Your seller account is approved.
            You can receive orders and manage
            tasks.
          </div>
        ) : profile.status ===
          'rejected' ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            ❌ Your seller account was
            rejected.
          </div>
        ) : (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-300">
            ⏳ Your seller account is waiting
            for admin approval.
          </div>
        )
      ) : null}

      {/* QUICK ACTIONS */}

      <div className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Quick Actions
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link href="/dashboard/seller/earnings">
            <Card className="cursor-pointer transition hover:border-emerald-500">
              <CardContent className="flex flex-col items-center justify-center py-6">
                <DollarSign className="mb-2 h-6 w-6 text-emerald-500" />

                <span className="font-medium">
                  Withdraw Earnings
                </span>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/orders?filter=ongoing">
            <Card className="cursor-pointer transition hover:border-blue-500">
              <CardContent className="flex flex-col items-center justify-center py-6">
                <Zap className="mb-2 h-6 w-6 text-blue-500" />

                <span className="font-medium">
                  View Ongoing Orders
                </span>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/orders?filter=completed">
            <Card className="cursor-pointer transition hover:border-cyan-500">
              <CardContent className="flex flex-col items-center justify-center py-6">
                <ClipboardList className="mb-2 h-6 w-6 text-cyan-500" />

                <span className="font-medium">
                  View Completed Orders
                </span>
              </CardContent>
            </Card>
          </Link>

          <Link href="/shop">
            <Card className="cursor-pointer transition hover:border-fuchsia-500">
              <CardContent className="flex flex-col items-center justify-center py-6">
                <ShoppingBag className="mb-2 h-6 w-6 text-fuchsia-500" />

                <span className="font-medium">
                  Browse Shop
                </span>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* STATS */}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>
              Available Balance
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="text-3xl font-bold">
              {stats.totalPoints} pts
            </div>

            <p className="text-sm text-muted-foreground">
              Withdrawable earnings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Lifetime Earnings
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="text-3xl font-bold">
              {stats.revenue} pts
            </div>

            <p className="text-sm text-muted-foreground">
              Total earned from completed
              orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Active Orders
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="text-3xl font-bold">
              {stats.activeOrders}
            </div>

            <p className="text-sm text-muted-foreground">
              Orders in progress
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Completed Orders
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="text-3xl font-bold">
              {stats.completedOrders}
            </div>

            <p className="text-sm text-muted-foreground">
              Successfully delivered
            </p>
          </CardContent>
        </Card>
      </div>

      {/* RECENT ORDERS */}

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>
              Recent Orders
            </CardTitle>

            <CardDescription>
              Latest activity from your orders
            </CardDescription>
          </CardHeader>

          <CardContent>
            {recentOrders.length === 0 ? (
              <div className="py-10 text-center text-slate-500">
                No recent orders found.
              </div>
            ) : (
              <div className="space-y-4">
                {recentOrders.map(
                  (order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div>
                        <div className="font-medium">
                          {order.product_name ??
                            'Order'}
                        </div>

                        <div className="text-sm text-slate-500">
                          {
                            order.game_name
                          }
                        </div>
                      </div>

                      <div className="text-right">
                        <div
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(
                            order.status
                          )}`}
                        >
                          {order.status}
                        </div>

                        <div className="mt-1 text-sm font-semibold">
                          {
                            order.points_price
                          }{' '}
                          pts
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
