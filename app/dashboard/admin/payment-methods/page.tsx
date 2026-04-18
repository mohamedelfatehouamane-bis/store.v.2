'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type PaymentAccount = {
  id: string;
  payment_method_id: string;
  account_number: string;
  account_name: string;
  is_active: boolean;
  usage_count: number;
  priority?: number;
  last_used?: string | null;
};

type PaymentMethod = {
  id: string;
  name: string;
  display_name: string;
  instructions: string;
  is_active: boolean;
  accounts: PaymentAccount[];
};

export default function AdminPaymentMethodsPage() {
  const { user } = useAuth();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAccountId, setSavingAccountId] = useState<string | null>(null);
  const [removingAccountId, setRemovingAccountId] = useState<string | null>(null);
  const [addingForMethodId, setAddingForMethodId] = useState<string | null>(null);
  const [creatingMethod, setCreatingMethod] = useState(false);
  const [newAccounts, setNewAccounts] = useState<Record<string, { account_name: string; account_number: string; priority: string }>>({});
  const [newMethod, setNewMethod] = useState({
    name: '',
    display_name: '',
    instructions: '',
    is_active: true,
  });

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;

    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast.error('Authentication required');
      return;
    }

    async function loadMethods() {
      setLoading(true);
      try {
        const response = await fetch('/api/admin/payment-methods', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'Unable to load payment methods');
        }
        setMethods(data.paymentMethods ?? []);
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : 'Failed to load payment methods');
      } finally {
        setLoading(false);
      }
    }

    loadMethods();
  }, [isAdmin]);

  const createMethod = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast.error('Authentication required');
      return;
    }

    const payload = {
      name: newMethod.name.trim().toLowerCase(),
      display_name: newMethod.display_name.trim(),
      instructions: newMethod.instructions.trim(),
      is_active: newMethod.is_active,
    };

    if (!payload.name || !payload.display_name || !payload.instructions) {
      toast.error('Name, display name, and instructions are required');
      return;
    }

    try {
      setCreatingMethod(true);
      const response = await fetch('/api/admin/payment-methods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to create payment method');
      }

      setMethods((current) => [...current, data.paymentMethod]);
      setNewMethod({ name: '', display_name: '', instructions: '', is_active: true });
      toast.success('Payment method created successfully');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to create payment method');
    } finally {
      setCreatingMethod(false);
    }
  };

  const updateMethodField = (id: string, field: keyof PaymentMethod, value: string | boolean) => {
    setMethods((current) =>
      current.map((method) =>
        method.id === id
          ? {
              ...method,
              [field]: value,
            }
          : method
      )
    );
  };

  const saveMethod = async (method: PaymentMethod) => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast.error('Authentication required');
      return;
    }

    try {
      setSavingId(method.id);
      const response = await fetch(`/api/admin/payment-methods/${method.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: method.name,
          display_name: method.display_name,
          instructions: method.instructions,
          is_active: method.is_active,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to save payment method');
      }

      toast.success(`${method.display_name} updated successfully`);
      setMethods((current) =>
        current.map((item) =>
          item.id === method.id
            ? {
                ...item,
                ...data.paymentMethod,
              }
            : item
        )
      );
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to save payment method');
    } finally {
      setSavingId(null);
    }
  };

  const updateAccountField = (
    methodId: string,
    accountId: string,
    field: keyof PaymentAccount,
    value: string | boolean | number
  ) => {
    setMethods((current) =>
      current.map((method) =>
        method.id === methodId
          ? {
              ...method,
              accounts: method.accounts.map((account) =>
                account.id === accountId
                  ? {
                      ...account,
                      [field]: value,
                    }
                  : account
              ),
            }
          : method
      )
    );
  };

  const saveAccount = async (methodId: string, account: PaymentAccount) => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast.error('Authentication required');
      return;
    }

    try {
      setSavingAccountId(account.id);
      const response = await fetch(`/api/admin/payment-method-accounts/${account.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          account_name: account.account_name,
          account_number: account.account_number,
          is_active: account.is_active,
          priority: Number(account.priority ?? 1),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to update payment account');
      }

      toast.success('Account updated successfully');
      setMethods((current) =>
        current.map((method) =>
          method.id === methodId
            ? {
                ...method,
                accounts: method.accounts.map((item) => (item.id === account.id ? { ...item, ...data.account } : item)),
              }
            : method
        )
      );
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to update payment account');
    } finally {
      setSavingAccountId(null);
    }
  };

  const addAccount = async (methodId: string) => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast.error('Authentication required');
      return;
    }

    const draft = newAccounts[methodId] || { account_name: '', account_number: '', priority: '1' };
    if (!draft.account_name.trim() || !draft.account_number.trim()) {
      toast.error('Account name and number are required');
      return;
    }

    try {
      setAddingForMethodId(methodId);
      const response = await fetch(`/api/admin/payment-methods/${methodId}/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          account_name: draft.account_name.trim(),
          account_number: draft.account_number.trim(),
          priority: Math.max(1, Number(draft.priority || 1)),
          is_active: true,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to add payment account');
      }

      toast.success('Account added successfully');
      setMethods((current) =>
        current.map((method) =>
          method.id === methodId
            ? {
                ...method,
                accounts: [...method.accounts, data.account],
              }
            : method
        )
      );
      setNewAccounts((current) => ({
        ...current,
        [methodId]: { account_name: '', account_number: '', priority: '1' },
      }));
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to add account');
    } finally {
      setAddingForMethodId(null);
    }
  };

  const removeAccount = async (methodId: string, accountId: string) => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast.error('Authentication required');
      return;
    }

    const confirmed = window.confirm('Remove this payment account? This action cannot be undone.');
    if (!confirmed) return;

    try {
      setRemovingAccountId(accountId);
      const response = await fetch(`/api/admin/payment-method-accounts/${accountId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to remove payment account');
      }

      setMethods((current) =>
        current.map((method) =>
          method.id === methodId
            ? { ...method, accounts: method.accounts.filter((account) => account.id !== accountId) }
            : method
        )
      );
      toast.success('Account removed successfully');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to remove account');
    } finally {
      setRemovingAccountId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex-1 p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
            <CardDescription>Only admins can manage payment methods.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Payment Methods</h1>
        <p className="mt-2 text-slate-600">Control customer payment instructions directly from database-backed settings.</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Add Payment Method</CardTitle>
          <CardDescription>Create a new method for customer top-up checkout instructions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Method Name (identifier)</label>
              <Input
                value={newMethod.name}
                onChange={(event) =>
                  setNewMethod((current) => ({ ...current, name: event.target.value.toLowerCase() }))
                }
                maxLength={50}
                placeholder="usdt_trc20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Display Name</label>
              <Input
                value={newMethod.display_name}
                onChange={(event) =>
                  setNewMethod((current) => ({ ...current, display_name: event.target.value }))
                }
                maxLength={120}
                placeholder="USDT (TRC20)"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Instructions</label>
            <textarea
              value={newMethod.instructions}
              onChange={(event) =>
                setNewMethod((current) => ({ ...current, instructions: event.target.value }))
              }
              rows={4}
              maxLength={4000}
              className="w-full rounded-md border border-slate-300 p-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Send payment and include transaction reference in your request."
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={newMethod.is_active}
              onChange={(event) =>
                setNewMethod((current) => ({ ...current, is_active: event.target.checked }))
              }
              className="h-4 w-4 rounded border-slate-300"
            />
            Active on create
          </label>

          <Button onClick={createMethod} disabled={creatingMethod} className="w-full sm:w-auto">
            {creatingMethod ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add Payment Method
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading payment methods...
          </CardContent>
        </Card>
      ) : methods.length === 0 ? (
        <Card>
          <CardContent className="py-20 text-center text-slate-600">No payment methods found.</CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {methods.map((method) => (
            <Card key={method.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-4 text-lg">
                  <span>{method.name}</span>
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={method.is_active}
                      onChange={(event) => updateMethodField(method.id, 'is_active', event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Active
                  </label>
                </CardTitle>
                <CardDescription>Edit display text, instructions, and activation state.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Method Name (identifier)</label>
                  <Input
                    value={method.name}
                    onChange={(event) => updateMethodField(method.id, 'name', event.target.value.toLowerCase())}
                    maxLength={50}
                    placeholder="baridimob"
                  />
                  <p className="text-xs text-slate-500">Allowed: lowercase letters, numbers, _ and -</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Display Name</label>
                  <Input
                    value={method.display_name}
                    onChange={(event) => updateMethodField(method.id, 'display_name', event.target.value)}
                    maxLength={120}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Instructions</label>
                  <textarea
                    value={method.instructions}
                    onChange={(event) => updateMethodField(method.id, 'instructions', event.target.value)}
                    rows={5}
                    maxLength={4000}
                    className="w-full rounded-md border border-slate-300 p-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                  <p className="text-xs text-slate-500">{method.instructions.length}/4000</p>
                </div>

                <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-700">Linked Accounts (rotation pool)</p>
                  {method.accounts.length === 0 ? (
                    <p className="text-sm text-slate-500">No active accounts configured for this payment method.</p>
                  ) : (
                    <div className="space-y-2">
                      {method.accounts.map((account) => (
                        <div key={account.id} className="space-y-3 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Input
                              value={account.account_name}
                              onChange={(event) => updateAccountField(method.id, account.id, 'account_name', event.target.value)}
                              placeholder="Account name"
                            />
                            <Input
                              value={account.account_number}
                              onChange={(event) => updateAccountField(method.id, account.id, 'account_number', event.target.value)}
                              placeholder="Account number"
                            />
                            <Input
                              type="number"
                              min={1}
                              value={String(account.priority ?? 1)}
                              onChange={(event) => updateAccountField(method.id, account.id, 'priority', Math.max(1, Number(event.target.value || 1)))}
                              placeholder="Priority"
                            />
                            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={account.is_active}
                                onChange={(event) => updateAccountField(method.id, account.id, 'is_active', event.target.checked)}
                              />
                              Active
                            </label>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="space-y-1 text-xs text-slate-500">
                              <p>Used {Number(account.usage_count ?? 0).toLocaleString()} times</p>
                              <p>Last used: {account.last_used ? new Date(account.last_used).toLocaleString() : 'Never'}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                onClick={() => saveAccount(method.id, account)}
                                disabled={savingAccountId === account.id || removingAccountId === account.id}
                              >
                                {savingAccountId === account.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Account
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={() => removeAccount(method.id, account.id)}
                                disabled={removingAccountId === account.id || savingAccountId === account.id}
                              >
                                {removingAccountId === account.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="mr-2 h-4 w-4" />
                                )}
                                Remove
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 space-y-2 rounded-md border border-dashed border-slate-300 bg-white p-3">
                    <p className="text-xs font-medium uppercase text-slate-500">Add account</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Input
                        value={newAccounts[method.id]?.account_name || ''}
                        onChange={(event) =>
                          setNewAccounts((current) => ({
                            ...current,
                            [method.id]: {
                              account_name: event.target.value,
                              account_number: current[method.id]?.account_number || '',
                              priority: current[method.id]?.priority || '1',
                            },
                          }))
                        }
                        placeholder="Account name"
                      />
                      <Input
                        value={newAccounts[method.id]?.account_number || ''}
                        onChange={(event) =>
                          setNewAccounts((current) => ({
                            ...current,
                            [method.id]: {
                              account_name: current[method.id]?.account_name || '',
                              account_number: event.target.value,
                              priority: current[method.id]?.priority || '1',
                            },
                          }))
                        }
                        placeholder="Account number"
                      />
                      <Input
                        type="number"
                        min={1}
                        value={newAccounts[method.id]?.priority || '1'}
                        onChange={(event) =>
                          setNewAccounts((current) => ({
                            ...current,
                            [method.id]: {
                              account_name: current[method.id]?.account_name || '',
                              account_number: current[method.id]?.account_number || '',
                              priority: event.target.value,
                            },
                          }))
                        }
                        placeholder="Priority"
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => addAccount(method.id)}
                      disabled={addingForMethodId === method.id}
                    >
                      {addingForMethodId === method.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-2 h-4 w-4" />
                      )}
                      Add Account
                    </Button>
                  </div>
                </div>

                <Button
                  onClick={() => saveMethod(method)}
                  disabled={savingId === method.id}
                  className="w-full sm:w-auto"
                >
                  {savingId === method.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
