'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { calculateTrustScore, isSellerRisky } from '@/lib/trust-score';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Search, Shield, Ban, CheckCircle, Pencil, Clock, AlertTriangle } from 'lucide-react';

type UserItem = {
  id: string;
  username: string;
  email: string;
  role: string;
  total_points: number;
  is_active: boolean;
  is_verified: boolean;
  verification_status?: string;
  seller_fee_percentage?: number;
  assigned_games?: string[];
  selected_games?: string[];
  rejection_reason?: string | null;
  rating?: number | null;
  total_reviews?: number | null;
  completed_orders?: number | null;
  dispute_count?: number | null;
  created_at: string;
};

type UserEditForm = {
  id: string;
  role: string;
  total_points: string;
  seller_fee_percentage: string;
  is_active: boolean;
  is_verified: boolean;
};

export default function UsersPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editForm, setEditForm] = useState<UserEditForm | null>(null);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

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

    async function loadUsers() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/users', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Unable to load users');
        }
        const normalizedUsers: UserItem[] = (data.users ?? []).map((item: UserItem) => {
          const selectedGames = Array.isArray(item.selected_games)
            ? item.selected_games
            : Array.isArray(item.assigned_games)
            ? item.assigned_games
            : [];

          return {
            ...item,
            selected_games: selectedGames,
            assigned_games: selectedGames,
          };
        });

        if (process.env.NODE_ENV !== 'production') {
          console.log('[users-page] /api/users response sellers',
            normalizedUsers
              .filter((u) => u.role === 'seller')
              .map((u) => ({ id: u.id, username: u.username, selected_games: u.selected_games }))
          );
        }

        setUsers(normalizedUsers);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to fetch users');
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, [isAdmin]);

  const filteredUsers = users.filter((item) =>
    `${item.username} ${item.email} ${item.role}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSellerVerification = async (userItem: UserItem, approve: boolean) => {
    setActionError('');
    setActionLoading(userItem.id);

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setActionError('Authentication required');
      setActionLoading(null);
      return;
    }

    let rejectionReason: string | undefined = undefined;
    if (!approve) {
      rejectionReason = window.prompt('Enter a reason for rejection:') || undefined;
      if (!rejectionReason) {
        setActionError('Rejection reason is required');
        setActionLoading(null);
        return;
      }
    }

    try {
      const response = await fetch('/api/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: userItem.id,
          role: userItem.role,
          total_points: userItem.total_points,
          is_active: userItem.is_active,
          is_verified: approve,
          rejection_reason: rejectionReason,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to update seller status');
      }

      setUsers((current) =>
        current.map((item) =>
          item.id === userItem.id
            ? {
                ...item,
                is_verified: approve,
                verification_status: approve ? 'approved' : 'rejected',
              }
            : item
        )
      );
    } catch (err) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : 'Failed to update seller status');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatus = (user: UserItem) => {
    if (!user.is_active) return 'suspended';
    if (user.role === 'seller') {
      if (user.verification_status === 'approved' || user.is_verified) return 'approved';
      if (user.verification_status === 'rejected') return 'rejected';
      return 'pending';
    }
    return 'active';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'pending':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'rejected':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'active':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'suspended':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4" />;
      case 'rejected':
        return <Ban className="h-4 w-4" />;
      case 'pending':
        return <Clock className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const openEditDialog = (userItem: UserItem) => {
    setSaveError('');
    setEditingUser(userItem);
    setEditForm({
      id: userItem.id,
      role: userItem.role,
      total_points: String(userItem.total_points ?? 0),
      seller_fee_percentage: String(userItem.seller_fee_percentage ?? 10),
      is_active: userItem.is_active,
      is_verified: userItem.is_verified,
    });
  };

  const closeEditDialog = () => {
    if (saving) {
      return;
    }

    setEditingUser(null);
    setEditForm(null);
    setSaveError('');
  };

  const saveUserChanges = async () => {
    if (!editForm) {
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setSaveError('Authentication required');
      return;
    }

    const totalPoints = Number(editForm.total_points);
    if (!Number.isFinite(totalPoints) || totalPoints < 0) {
      setSaveError('Points must be a valid number greater than or equal to 0');
      return;
    }

    const sellerFeePercentage = Number(editForm.seller_fee_percentage);
    if (editForm.role === 'seller' && (!Number.isFinite(sellerFeePercentage) || sellerFeePercentage < 0 || sellerFeePercentage > 100)) {
      setSaveError('Seller fee must be a number between 0 and 100');
      return;
    }

    setSaving(true);
    setSaveError('');

    try {
      const response = await fetch('/api/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: editForm.id,
          role: editForm.role,
          total_points: totalPoints,
          seller_fee_percentage: editForm.role === 'seller' ? sellerFeePercentage : undefined,
          is_active: editForm.is_active,
          is_verified: editForm.is_verified,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to update user');
      }

      setUsers((current) =>
        current.map((item) => (item.id === data.user.id ? { ...item, ...data.user } : item))
      );
      setEditingUser(null);
      setEditForm(null);
    } catch (err) {
      console.error(err);
      setSaveError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t('userManagement')}</h1>
          <p className="text-slate-600 mt-2">{t('onlyAdminsCanManageUsers')}</p>
        </div>
        <Card className="text-center py-8">
          <p className="text-slate-600">{t('noPermissionAccessPage')}</p>
        </Card>
      </div>
    );
  }

  const verifiedSellers = users.filter((item) => item.role === 'seller' && item.is_verified).length;
  const pendingVerification = users.filter((item) => item.role === 'seller' && !item.is_verified).length;
  const suspendedAccounts = users.filter((item) => !item.is_active).length;

  return (
    <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t('userManagement')}</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">{t('managePlatformUsersAccounts')}</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('totalUsers')}</CardTitle>
            <Shield className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{users.length}</div>
            <p className="text-xs text-slate-600 mt-1">{t('registeredUsers')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('verifiedSellers')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{verifiedSellers}</div>
            <p className="text-xs text-slate-600 mt-1">{t('activeServiceProviders')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('pendingVerification')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{pendingVerification}</div>
            <p className="text-xs text-slate-600 mt-1">{t('awaitingReview')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('suspendedAccounts')}</CardTitle>
            <Ban className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{suspendedAccounts}</div>
            <p className="text-xs text-slate-600 mt-1">{t('disabledUsers')}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-5 w-5" />
          <Input
            placeholder={t('searchUsers')}
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" className="w-full sm:w-auto">{t('filterByRole')}</Button>
        <Button variant="outline" className="w-full sm:w-auto">{t('filterByStatus')}</Button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-4 sm:p-6">
          {loading ? (
            <div className="py-12 text-center text-slate-500">{t('loadingUsers')}</div>
          ) : filteredUsers.length > 0 ? (
            <div className="space-y-4">
              {filteredUsers.map((userItem) => {
                const status = getStatus(userItem);
                const trustScore = calculateTrustScore({
                  rating: userItem.rating,
                  completed_orders: userItem.completed_orders,
                  dispute_count: userItem.dispute_count,
                });
                const showSellerRisk = userItem.role === 'seller' && isSellerRisky({
                  rating: userItem.rating,
                  dispute_count: userItem.dispute_count,
                });
                return (
                  <div key={userItem.id} className="rounded-lg border border-slate-200 p-3 sm:p-4 transition-colors hover:bg-slate-50">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-sm font-bold text-white">
                        {userItem.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-slate-900">{userItem.username}</p>
                        <p className="truncate text-sm text-slate-600">{userItem.email}</p>
                        {showSellerRisk && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            <AlertTriangle className="h-3 w-3" />
                            {t('riskySeller')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-lg border border-slate-200 px-3 py-2">
                        <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{t('role')}</p>
                        <p className="font-medium capitalize text-slate-900">{userItem.role}</p>
                      </div>

                      <div className="rounded-lg border border-slate-200 px-3 py-2">
                        <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{t('points')}</p>
                        <p className="font-medium text-slate-900">{userItem.total_points}</p>
                      </div>

                      <div className="rounded-lg border border-slate-200 px-3 py-2">
                        <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{t('sellerFeePercent')}</p>
                        <p className="font-medium text-slate-900">
                          {userItem.role === 'seller' ? (userItem.seller_fee_percentage ?? 10) : '-'}
                        </p>
                      </div>

                      <div className="rounded-lg border border-slate-200 px-3 py-2">
                        <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Status</p>
                        <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium border ${getStatusColor(status)}`}>
                          {getStatusIcon(status)}
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </div>

                      {userItem.role === 'seller' && (
                        <div className="rounded-lg border border-slate-200 px-3 py-2">
                          <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{t('trustScore')}</p>
                          <p className="font-medium text-slate-900">{trustScore.toFixed(2)}</p>
                        </div>
                      )}

                      <div className="rounded-lg border border-slate-200 px-3 py-2">
                        <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{t('joined')}</p>
                        <p className="font-medium text-slate-900">{new Date(userItem.created_at).toLocaleDateString()}</p>
                      </div>

                      {userItem.verification_status === 'rejected' && userItem.rejection_reason && (
                        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                          <span className="font-semibold">{t('rejected')}:</span> {userItem.rejection_reason}
                        </div>
                      )}

                      <div className="flex flex-col gap-2 sm:col-span-2 xl:col-span-4">
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full sm:w-auto"
                            disabled={
                              userItem.role !== 'seller' ||
                              getStatus(userItem) === 'approved' ||
                              actionLoading === userItem.id
                            }
                            onClick={() => handleSellerVerification(userItem, true)}
                          >
                            {t('approve')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full sm:w-auto"
                            disabled={
                              userItem.role !== 'seller' ||
                              getStatus(userItem) === 'rejected' ||
                              actionLoading === userItem.id
                            }
                            onClick={() => handleSellerVerification(userItem, false)}
                          >
                            {t('reject')}
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() => openEditDialog(userItem)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            {t('edit')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-600">{t('noUsersFound')}</div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editingUser && editForm)} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent className="max-w-[calc(100%-1.5rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('editUser')}</DialogTitle>
            <DialogDescription>
              {t('updateRolePointsStatus')} {editingUser?.username}.
            </DialogDescription>
          </DialogHeader>

          {editForm && (
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-900">{t('role')}</p>
                <Select
                  value={editForm.role}
                  onValueChange={(value) =>
                    setEditForm((current) => (current ? { ...current, role: value } : current))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('selectRole')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">{t('customer')}</SelectItem>
                    <SelectItem value="seller">{t('seller')}</SelectItem>
                    <SelectItem value="admin">{t('admin')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-900">{t('points')}</p>
                <Input
                  type="number"
                  min="0"
                  value={editForm.total_points}
                  onChange={(e) =>
                    setEditForm((current) =>
                      current ? { ...current, total_points: e.target.value } : current
                    )
                  }
                />
              </div>

              {editForm.role === 'seller' && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-900">{t('sellerFeePercentage')}</p>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={editForm.seller_fee_percentage}
                    onChange={(e) =>
                      setEditForm((current) =>
                        current ? { ...current, seller_fee_percentage: e.target.value } : current
                      )
                    }
                  />
                  <p className="text-xs text-slate-600">{t('adminControlledFeeUsed')}</p>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{t('activeAccount')}</p>
                  <p className="text-xs text-slate-600">{t('allowUserSignIn')}</p>
                </div>
                <Switch
                  checked={editForm.is_active}
                  onCheckedChange={(checked) =>
                    setEditForm((current) => (current ? { ...current, is_active: checked } : current))
                  }
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{t('verifiedSeller')}</p>
                  <p className="text-xs text-slate-600">{t('markVerifiedForSellerWorkflows')}</p>
                </div>
                <Switch
                  checked={editForm.is_verified}
                  onCheckedChange={(checked) =>
                    setEditForm((current) => (current ? { ...current, is_verified: checked } : current))
                  }
                />
              </div>

              {saveError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {saveError}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeEditDialog} disabled={saving} className="w-full sm:w-auto">
              {t('cancel')}
            </Button>
            <Button onClick={saveUserChanges} disabled={saving || !editForm} className="w-full sm:w-auto">
              {saving ? t('saving') : t('saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
