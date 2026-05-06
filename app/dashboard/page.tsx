'use client';

import { useEffect, useState } from 'react';
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

    case ORDER_STATUS.DISPUTED:
      return 'bg-amber-50 text-amber-700 border border-amber-200';

    default:
      return 'bg-slate-50 text-slate-700 border border-slate-200';
  }
}

export default function DashboardHome() {
  const { user } = useAuth();

  const [profile, setProfile] =
    useState<ProfileData | null>(null);

  const [stats, setStats] = useState({
    totalPoints: 0,
    activeOrders: 0,
    completedOrders: 0,
    totalUsers: 0,
    totalOrders: 0,
    revenue: 0,
  });

  const [recentOrders, setRecentOrders] =
    useState<OrderItem[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');

  const isCustomer = user?.role === 'customer';

  const isSeller = user?.role === 'seller';

  const isAdmin = user?.role === 'admin';

  const sellerIsApproved =
    user?.role === 'seller' &&
    profile?.status === 'approved';

  useEffect(() => {
    if (!user) return;

    const token =
      localStorage.getItem('auth_token');

    if (!token) {
      setError(
        'You must be signed in to view dashboard data.'
      );

      setLoading(false);

      return;
    }

    async function loadDashboard() {
      try {
        // =========================================
        // ADMIN DASHBOARD
        // =========================================

        if (isAdmin) {
          const [usersRes, ordersRes] =
            await Promise.all([
              fetch('/api/users', {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }),

              fetch('/api/orders', {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }),
            ]);

          if (!usersRes.ok)
            throw new Error(
              'Unable to load users'
            );

          if (!ordersRes.ok)
            throw new Error(
              'Unable to load orders'
            );

          const usersData =
            await usersRes.json();

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

          const revenue = orders
            .filter(
              (o: any) =>
                o.status ===
                ORDER_STATUS.COMPLETED
            )
            .reduce(
              (sum: number, o: any) =>
                sum +
                Number(o.points_price || 0),
              0
            );

          setStats({
            totalPoints: 0,

            activeOrders: orders.filter(
              (o: any) =>
                isActiveOrderStatus(o.status)
            ).length,

            completedOrders: orders.filter(
              (o: any) =>
                o.status ===
                ORDER_STATUS.COMPLETED
            ).length,

            totalUsers: Array.isArray(
              usersData.users
            )
              ? usersData.users.length
              : 0,

            totalOrders: orders.length,

            revenue,
          });

          setRecentOrders(
            orders.slice(0, 5)
          );
        }

        // =========================================
        // SELLER DASHBOARD
        // =========================================

        else if (isSeller) {
          const [profileRes, sellerRes] =
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

          if (!profileRes.ok)
            throw new Error(
              'Unable to load profile'
            );

          if (!sellerRes.ok)
            throw new Error(
              'Unable to load seller orders'
            );

          const profileData =
            await profileRes.json();

          const sellerData =
            await sellerRes.json();

          const myTasks = (
            sellerData.orders ?? []
          ).map((order: any) => ({
            ...order,
            status: normalizeStatus(
              order.status
            ),
          }));

          const earnings = myTasks
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

          setStats({
            totalPoints: Number(
              profileData.user
                ?.total_points ?? 0
            ),

            activeOrders: myTasks.filter(
              (o: any) =>
                isActiveOrderStatus(o.status)
            ).length,

            completedOrders: myTasks.filter(
              (o: any) =>
                o.status ===
                ORDER_STATUS.COMPLETED
            ).length,

            totalUsers: 0,

            totalOrders: myTasks.length,

            revenue: earnings,
          });

          setRecentOrders(
            myTasks.slice(0, 5)
          );
        }
      } catch (err) {
        console.error(err);

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load dashboard data'
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
    <div className="space-y-6">
      {/* HEADER */}

      <div>
        <h1 className="text-3xl font-bold text-white">
          Welcome back, {user?.username}!
        </h1>

        <p className="mt-1 text-slate-400">
          Manage your orders and grow your
          game services business.
        </p>
      </div>

      {/* SELLER STATUS */}

      {isSeller && profile ? (
        sellerIsApproved ? (
          <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-400">
            ✅ Your seller account is approved.
            You can receive orders and manage
            tasks.
          </div>
        ) : profile.status ===
          'rejected' ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            ❌ Your seller account was
            rejected.
          </div>
        ) : (
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
            ⏳ Your seller account is waiting
            for admin approval.
          </div>
        )
      ) : null}

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
              Completed orders
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
    </div>
  );
}
