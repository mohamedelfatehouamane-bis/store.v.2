'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Search, Filter, Plus } from 'lucide-react';

type OrderItem = {
  id: string;
  product_name: string;
  game_name: string;
  status: string;
  points_price: number;
  assigned_seller_id?: string | null;
  created_at: string;
};

function getStatusColor(status: string) {
  switch (status) {
    case 'pending':
      return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    case 'in_progress':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'completed':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'cancelled':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'open':
      return 'bg-slate-50 text-slate-700 border-slate-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

function getStatusLabel(status: string) {
  return status.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function OrdersPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const orderFilter = user?.role === 'seller' ? 'my-tasks' : user?.role === 'customer' ? 'my-orders' : '';

  useEffect(() => {
    if (!user) {
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setError('Authentication required');
      return;
    }

    async function loadOrders() {
      setLoading(true);
      setError('');
      try {
        const query = orderFilter ? `?filter=${orderFilter}` : '';
        const statusQuery = statusFilter !== 'all' ? `&status=${statusFilter.toLowerCase()}` : '';
        const response = await fetch(`/api/orders${query}${statusQuery}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error('Unable to load orders');
        }

        const data = await response.json();
        setOrders(data.orders ?? []);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to fetch orders');
      } finally {
        setLoading(false);
      }
    }

    loadOrders();
  }, [user, orderFilter, statusFilter]);

  const filteredOrders = orders.filter((order) =>
    `${order.product_name} ${order.game_name}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const progressWidth = (status: string) => {
    switch (status) {
      case 'completed':
        return '100%';
      case 'in_progress':
        return '60%';
      case 'open':
      case 'pending':
        return '20%';
      default:
        return '0%';
    }
  };

  return (
    <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mb-6 sm:mb-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t('myOrders')}</h1>
            <p className="mt-2 text-sm text-slate-600 sm:text-base">{t('trackManageOrders')}</p>
          </div>
          <Link href="/dashboard/post-task">
            <Button className="w-full gap-2 sm:w-auto">
              <Plus size={18} />
              {t('postNewTask')}
            </Button>
          </Link>
        </div>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-5 w-5" />
            <Input
              placeholder={t('searchOrders')}
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" className="w-full gap-2 sm:w-auto">
            <Filter size={18} />
            {t('filter')}
          </Button>
        </div>
      </div>

      <div className="mb-6 overflow-x-auto border-b border-slate-200">
        <div className="flex min-w-max gap-2">
        {[
          { key: 'all', label: t('all') },
          { key: 'pending', label: t('pending') },
          { key: 'in_progress', label: t('inProgress') },
          { key: 'completed', label: t('completed') },
        ].map((status) => (
          <button
            key={status.key}
            className={`px-4 py-2 font-medium text-sm border-b-2 border-transparent hover:border-blue-600 hover:text-blue-600 transition-colors ${
              statusFilter === status.key ? 'border-blue-600 text-blue-600' : ''
            }`}
            onClick={() => setStatusFilter(status.key)}
          >
            {status.label}
          </button>
        ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((index) => (
              <Card key={index}>
                <CardContent className="space-y-4 p-6">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredOrders.length > 0 ? (
          filteredOrders.map((order) => (
            <Card key={order.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  <div className="md:col-span-4">
                    <p className="text-xs uppercase text-slate-500 font-semibold tracking-wide mb-1">
                      {order.game_name}
                    </p>
                    <Link href={`/dashboard/orders/${order.id}`}>
                      <h3 className="font-semibold text-slate-900 hover:text-blue-600 transition-colors">
                        {order.product_name}
                      </h3>
                    </Link>
                    <p className="text-sm text-slate-600 mt-1">
                      {order.assigned_seller_id ? t('sellerAssigned') : t('waitingForSeller')}
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <p className="text-xs uppercase text-slate-500 font-semibold tracking-wide mb-1">
                      {t('price')}
                    </p>
                    <p className="text-lg font-bold text-slate-900">{order.points_price} pts</p>
                  </div>

                  <div className="md:col-span-2">
                    <p className="text-xs uppercase text-slate-500 font-semibold tracking-wide mb-2">
                      {t('progress')}
                    </p>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: progressWidth(order.status) }} />
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{getStatusLabel(order.status)}</p>
                  </div>

                  <div className="md:col-span-2">
                    <p className="text-xs uppercase text-slate-500 font-semibold tracking-wide mb-1">
                      {t('status')}
                    </p>
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium border ${getStatusColor(order.status)}`}>
                      {getStatusLabel(order.status)}
                    </span>
                  </div>

                  <div className="md:col-span-2 flex gap-2">
                    <Link href={`/dashboard/orders/${order.id}`}>
                      <Button variant="outline" size="sm" className="w-full sm:w-auto">
                        {t('view')}
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-slate-600 mb-4">{t('noOrdersFound')}</p>
              <Link href="/dashboard/post-task">
                <Button className="w-full sm:w-auto">{t('postFirstTask')}</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
