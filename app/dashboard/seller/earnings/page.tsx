'use client';

import { useEffect, useState } from 'react';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type Withdrawal = {
  id: string;
  amount_requested: number;
  fee_percentage: number;
  final_amount: number;
  status: string;
  payment_method?: string;
  payment_details?: string;
  created_at: string;
};

export default function SellerEarningsPage() {
  const [balance, setBalance] =
    useState(0);

  const [amount, setAmount] =
    useState('');

  const [paymentMethod, setPaymentMethod] =
    useState('USDT');

  const [paymentDetails, setPaymentDetails] =
    useState('');

  const [withdrawals, setWithdrawals] =
    useState<Withdrawal[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const token =
        localStorage.getItem('auth_token');

      if (!token) return;

      const [profileRes, withdrawalsRes] =
        await Promise.all([
          fetch('/api/users/profile', {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),

          fetch('/api/withdrawals', {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
        ]);

      const profileData =
        await profileRes.json();

      const withdrawalsData =
        await withdrawalsRes.json();

      setBalance(
        Number(
          profileData.user
            ?.total_points ?? 0
        )
      );

      setWithdrawals(
        withdrawalsData.withdrawals ??
          []
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function handleWithdraw(
    e: React.FormEvent
  ) {
    e.preventDefault();

    setError('');
    setSuccess('');

    const value = Number(amount);

    if (!value || value < 1000) {
      setError(
        'Minimum withdrawal is 1000 pts'
      );

      return;
    }

    if (value > balance) {
      setError(
        'Insufficient balance'
      );

      return;
    }

    try {
      setLoading(true);

      const token =
        localStorage.getItem('auth_token');

      const res = await fetch(
        '/api/withdrawals',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
            amount_requested: value,
            payment_method:
              paymentMethod,
            payment_details:
              paymentDetails,
          }),
        }
      );

      const data =
        await res.json();

      if (!res.ok) {
        throw new Error(
          data.error ||
            'Withdrawal failed'
        );
      }

      setSuccess(
        'Withdrawal request submitted successfully'
      );

      setAmount('');

      setPaymentDetails('');

      loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Withdrawal failed'
      );
    } finally {
      setLoading(false);
    }
  }

  function statusColor(
    status: string
  ) {
    switch (status) {
      case 'approved':
        return 'text-green-500';

      case 'rejected':
        return 'text-red-500';

      default:
        return 'text-yellow-500';
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-bold">
          Withdraw Earnings
        </h1>

        <p className="text-slate-500">
          Manage your seller earnings
          and payouts.
        </p>
      </div>

      {/* BALANCE */}

      <Card>
        <CardHeader>
          <CardTitle>
            Available Balance
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="text-4xl font-bold">
            {balance} pts
          </div>
        </CardContent>
      </Card>

      {/* FORM */}

      <Card>
        <CardHeader>
          <CardTitle>
            Request Withdrawal
          </CardTitle>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={
              handleWithdraw
            }
            className="space-y-4"
          >
            <div>
              <label className="mb-2 block text-sm font-medium">
                Amount
              </label>

              <input
                type="number"
                min="1000"
                value={amount}
                onChange={(e) =>
                  setAmount(
                    e.target.value
                  )
                }
                className="w-full rounded-lg border bg-background px-4 py-3"
                placeholder="Enter amount"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Payment Method
              </label>

              <select
                value={
                  paymentMethod
                }
                onChange={(e) =>
                  setPaymentMethod(
                    e.target.value
                  )
                }
                className="w-full rounded-lg border bg-background px-4 py-3"
              >
                <option value="USDT">
                  USDT
                </option>

                <option value="BaridiMob">
                  BaridiMob
                </option>

                <option value="Bank">
                  Bank Transfer
                </option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Payment Details
              </label>

              <textarea
                value={
                  paymentDetails
                }
                onChange={(e) =>
                  setPaymentDetails(
                    e.target.value
                  )
                }
                className="w-full rounded-lg border bg-background px-4 py-3"
                rows={4}
                placeholder="Wallet address / bank details"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-400">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-emerald-600 px-6 py-3 font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading
                ? 'Processing...'
                : 'Request Withdrawal'}
            </button>
          </form>
        </CardContent>
      </Card>

      {/* HISTORY */}

      <Card>
        <CardHeader>
          <CardTitle>
            Withdrawal History
          </CardTitle>
        </CardHeader>

        <CardContent>
          {withdrawals.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              No withdrawals yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-3">
                      Amount
                    </th>

                    <th className="py-3">
                      Fee %
                    </th>

                    <th className="py-3">
                      Final
                    </th>

                    <th className="py-3">
                      Status
                    </th>

                    <th className="py-3">
                      Date
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {withdrawals.map(
                    (
                      withdrawal
                    ) => (
                      <tr
                        key={
                          withdrawal.id
                        }
                        className="border-b"
                      >
                        <td className="py-4">
                          {
                            withdrawal.amount_requested
                          }{' '}
                          pts
                        </td>

                        <td className="py-4">
                          {
                            withdrawal.fee_percentage
                          }
                          %
                        </td>

                        <td className="py-4">
                          {
                            withdrawal.final_amount
                          }{' '}
                          pts
                        </td>

                        <td className="py-4">
                          <span
                            className={`font-medium ${statusColor(
                              withdrawal.status
                            )}`}
                          >
                            {
                              withdrawal.status
                            }
                          </span>
                        </td>

                        <td className="py-4">
                          {new Date(
                            withdrawal.created_at
                          ).toLocaleDateString()}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
