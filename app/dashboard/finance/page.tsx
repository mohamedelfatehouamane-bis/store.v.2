'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { DollarSign, ArrowUpRight, ArrowDownRight, Shield } from 'lucide-react';

type MonthlyData = {
  month: string;
  topups: number;
  withdrawals: number;
  fees: number;
  completedOrders: number;
};

export default function FinancePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [metrics, setMetrics] = useState<{
    topupsTotal: number;
    withdrawalsTotal: number;
    feesTotal: number;
    completedOrdersTotal: number;
    monthlyBreakdown: MonthlyData[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setError('Authentication required');
      return;
    }

    async function loadFinanceMetrics() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/admin/finance', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error('Unable to load finance metrics');
        }
        const data = await response.json();
        setMetrics(data);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load finance metrics');
      } finally {
        setLoading(false);
      }
    }

    loadFinanceMetrics();
  }, [isAdmin]);

  const chartData = useMemo(() => metrics?.monthlyBreakdown ?? [], [metrics]);

  if (!isAdmin) {
    return (
      <div className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">{t('financeDashboard')}</h1>
          <p className="text-slate-600 mt-2">{t('adminAccessFinanceRequired')}</p>
        </div>
        <Card className="text-center py-8">
          <p className="text-slate-600">{t('noPermissionFinance')}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">{t('financeDashboard')}</h1>
        <p className="text-slate-600 mt-2">{t('financeVisibility')}</p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('totalTopups')}</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${metrics?.topupsTotal.toLocaleString() ?? '0'}</div>
            <p className="text-xs text-slate-600 mt-1">{t('completedTopupAmount')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('totalWithdrawals')}</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${metrics?.withdrawalsTotal.toLocaleString() ?? '0'}</div>
            <p className="text-xs text-slate-600 mt-1">{t('approvedWithdrawalAmount')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('totalFeesEarned')}</CardTitle>
            <Shield className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${metrics?.feesTotal.toLocaleString() ?? '0'}</div>
            <p className="text-xs text-slate-600 mt-1">{t('platformFeeRevenue')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('completedOrdersLabel')}</CardTitle>
            <DollarSign className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics?.completedOrdersTotal ?? 0}</div>
            <p className="text-xs text-slate-600 mt-1">{t('completedOrdersLabel')}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>{t('monthlyFinanceTrends')}</CardTitle>
            <CardDescription>{t('topupsWithdrawalsFees')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="topups" stroke="#10b981" strokeWidth={2} name={t('topups')} />
                <Line type="monotone" dataKey="withdrawals" stroke="#f97316" strokeWidth={2} name={t('withdrawals')} />
                <Line type="monotone" dataKey="fees" stroke="#3b82f6" strokeWidth={2} name={t('fees')} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('ordersCompletedTrend')}</CardTitle>
            <CardDescription>{t('lastSixMonths')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="completedOrders" fill="#7c3aed" name={t('completedOrdersLabel')} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
