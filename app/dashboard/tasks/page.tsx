'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Search, AlertCircle, Clock } from 'lucide-react';

type OrderItem = {
  id: string;
  product_name: string;
  game_name: string;
  status: string;
  points_price: number;
  created_at: string;
};

type ProfileData = {
  verification_status?: string;
  is_verified: boolean;
};

function getStatusColor(status: string) {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'in_progress':
      return 'bg-blue-100 text-blue-800';
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    case 'open':
      return 'bg-slate-100 text-slate-800';
    default:
      return 'bg-slate-100 text-slate-800';
  }
}

export default function TasksPage() {
  const { user } = useAuth();
  const [availableOrders, setAvailableOrders] = useState<OrderItem[]>([]);
  const [myOrders, setMyOrders] = useState<OrderItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sellerStatus, setSellerStatus] = useState<string | null>(null);
  const [pickingOrderId, setPickingOrderId] = useState<string | null>(null);

  const isSeller = user?.role === 'seller';
  const isApprovedSeller = sellerStatus === 'verified' || sellerStatus === 'approved';
  const showApprovalOverlay = sellerStatus !== 'verified' && sellerStatus !== 'approved' && sellerStatus !== null;

  const loadOrders = async (token: string) => {
    setLoading(true);
    setError('');
    try {
      const [profileRes, availableRes, myTasksRes] = await Promise.all([
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
        throw new Error('Unable to load seller profile');
      }

      if (!availableRes.ok || !myTasksRes.ok) {
        throw new Error('Unable to load task orders');
      }

      const profileData = await profileRes.json();
      const availableData = await availableRes.json();
      const myTasksData = await myTasksRes.json();

      const profile = profileData.user as ProfileData;
      setSellerStatus(
        profile.verification_status || (profile.is_verified ? 'approved' : 'pending')
      );

      setAvailableOrders(availableData.orders ?? []);
      setMyOrders(myTasksData.orders ?? []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSeller) {
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setError('Authentication required');
      return;
    }

    loadOrders(token);
  }, [isSeller]);

  const handlePickOrder = async (orderId: string) => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setError('Authentication required');
      return;
    }

    setPickingOrderId(orderId);
    setError('');
    try {
      const response = await fetch('/api/orders/pick', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ order_id: orderId }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to pick order');
      }

      await loadOrders(token);
    } catch (err) {
      console.error('Pick order error:', err);
      setError(err instanceof Error ? err.message : 'Failed to pick order');
    } finally {
      setPickingOrderId(null);
    }
  };

  if (!isSeller) {
    return (
      <div className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Available Tasks</h1>
          <p className="text-slate-600 mt-2">Only sellers can pick tasks. Switch to a seller account to view available orders.</p>
        </div>
        <Card className="text-center py-8">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-slate-400" />
          <p className="text-slate-600">You need a seller account to pick orders.</p>
        </Card>
      </div>
    );
  }

  const filteredOrders = availableOrders.filter((order) =>
    `${order.product_name} ${order.game_name}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Available Orders</h1>
        <p className="text-slate-600 mt-2">Pick orders from your assigned games and manage your current tasks.</p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {sellerStatus === 'pending' && (
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          ⏳ Your account is under review. You cannot accept orders yet.
        </div>
      )}
      {sellerStatus === 'rejected' && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          ❌ Your seller account was rejected. Contact support.
        </div>
      )}
      {(sellerStatus === 'verified' || sellerStatus === 'approved') && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✅ You are verified and can accept orders.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="relative mb-8">
            <div className={`${showApprovalOverlay ? 'opacity-40 pointer-events-none' : ''}`}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Available Orders ({availableOrders.length})
                  </CardTitle>
                  <CardDescription>Orders from your assigned games waiting to be picked.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex gap-2">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-5 w-5" />
                      <Input
                        placeholder="Search orders..."
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        disabled={!isApprovedSeller}
                      />
                    </div>
                  </div>

                  {loading ? (
                    <div className="p-8 text-center text-slate-500">Loading orders...</div>
                  ) : filteredOrders.length > 0 ? (
                    <div className="space-y-3">
                      {filteredOrders.map((order) => (
                        <Card key={order.id} className="hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <h4 className="font-bold text-slate-900">{order.product_name}</h4>
                                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                    {order.game_name}
                                  </span>
                                </div>
                                <p className="text-sm text-slate-600 mb-2">
                                  Posted {new Date(order.created_at).toLocaleDateString()}
                                </p>
                                <div className="flex items-center gap-4 text-sm">
                                  <span className="flex items-center gap-1 text-slate-600">
                                    <Clock className="h-4 w-4" />
                                    {order.status.replace('_', ' ')}
                                  </span>
                                  <span className="font-bold text-blue-600">{order.points_price} pts</span>
                                </div>
                              </div>
                              <Button
                                className="whitespace-nowrap"
                                disabled={!isApprovedSeller || pickingOrderId === order.id}
                                onClick={() => handlePickOrder(order.id)}
                              >
                                {pickingOrderId === order.id ? 'Picking...' : 'Pick Order'}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card className="text-center py-8">
                      <p className="text-slate-600">No available orders found. Check back soon.</p>
                    </Card>
                  )}
                </CardContent>
              </Card>
            </div>

            {showApprovalOverlay && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-50/70">
                <div className="max-w-md rounded-3xl border border-slate-200 bg-white/95 p-6 text-center shadow-xl backdrop-blur-sm">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 text-2xl">
                    ⏳
                  </div>
                  <p className="text-sm font-semibold text-slate-900">Your account is under review.</p>
                  <p className="mt-2 text-sm text-slate-600">Tasks will unlock after approval.</p>
                </div>
              </div>
            )}
          </div>
        </div>
        <div>
          <Card>
            <CardHeader>
              <CardTitle>My Current Orders ({myOrders.length})</CardTitle>
              <CardDescription>Orders you have already picked.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-slate-500">Loading assigned orders...</div>
              ) : myOrders.length === 0 ? (
                <div className="py-8 text-center text-slate-600">You have not picked any orders yet.</div>
              ) : (
                <div className="space-y-3">
                  {myOrders.map((order) => (
                    <Card key={order.id} className="p-3 bg-slate-50">
                      <p className="font-semibold text-sm text-slate-900 mb-1">{order.product_name}</p>
                      <p className="text-xs text-slate-600 mb-2">{order.game_name}</p>
                      <div className="space-y-1 text-xs mb-2">
                        <p>
                          <span className="text-slate-600">Status:</span>
                          <span className="ml-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded inline-block font-medium">
                            {order.status.replace('_', ' ')}
                          </span>
                        </p>
                        <p className="text-slate-600">Picked {new Date(order.created_at).toLocaleDateString()}</p>
                        <p className="font-bold text-green-600">Value: {order.points_price} pts</p>
                      </div>
                      <Link href={`/dashboard/orders/${order.id}`}>
                        <Button size="sm" variant="outline" className="w-full text-xs">
                          View Details
                        </Button>
                      </Link>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
