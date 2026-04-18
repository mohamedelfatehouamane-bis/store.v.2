'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Gamepad2, Plus, Pencil, Trash2, Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

type Game = {
  id: string;
  name: string;
};

type GameAccount = {
  id: string;
  game_id: string | null;
  game_name: string | null;
  game_image: string | null;
  account_identifier: string;
  account_email: string | null;
  created_at: string;
  updated_at: string;
};

const emptyForm = {
  game_id: '',
  account_identifier: '',
  account_email: '',
  account_password: '',
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function GameAccountsPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [accounts, setAccounts] = useState<GameAccount[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<GameAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GameAccount | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchAccounts = async () => {
    const headers = authHeaders();
    if (!('Authorization' in headers)) return;

    try {
      const res = await fetch('/api/game-accounts', { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t('failedToLoadAccounts'));
      setAccounts(data.accounts ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('failedToLoadAccounts'));
    } finally {
      setLoading(false);
    }
  };

  const fetchGames = async () => {
    try {
      const res = await fetch('/api/games');
      const data = await res.json();
      setGames(data.games ?? []);
    } catch {
      setGames([]);
    }
  };

  useEffect(() => {
    if (user) {
      fetchAccounts();
      fetchGames();
    }
  }, [user]);

  const openAddDialog = () => {
    setForm(emptyForm);
    setShowPassword(false);
    setShowAddDialog(true);
  };

  const openEditDialog = (account: GameAccount) => {
    setEditTarget(account);
    setForm({
      game_id: account.game_id ?? '',
      account_identifier: account.account_identifier,
      account_email: account.account_email ?? '',
      account_password: '',
    });
    setShowPassword(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.game_id) {
      toast.error(t('selectGameRequired'));
      return;
    }
    if (!form.account_identifier.trim()) {
      toast.error(t('accountIdRequired'));
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/game-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          game_id: form.game_id,
          account_identifier: form.account_identifier.trim(),
          ...(form.account_email.trim() ? { account_email: form.account_email.trim() } : {}),
          ...(form.account_password ? { account_password: form.account_password } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t('failedToAddAccount'));

      toast.success(t('gameAccountAdded'));
      setShowAddDialog(false);
      await fetchAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('failedToAddAccount'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;

    if (!form.account_identifier.trim() && !form.account_email.trim() && !form.account_password) {
      toast.error(t('provideAtLeastOneFieldToUpdate'));
      return;
    }

    const body: Record<string, string> = {};
    if (form.account_identifier.trim()) body.account_identifier = form.account_identifier.trim();
    // Send empty string to clear email, or new value to update it
    if (form.account_email !== (editTarget.account_email ?? '')) {
      body.account_email = form.account_email.trim();
    }
    if (form.account_password) body.account_password = form.account_password;

    try {
      setSubmitting(true);
      const res = await fetch(`/api/game-accounts/${editTarget.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t('failedToUpdateAccount'));

      toast.success(t('accountUpdated'));
      setEditTarget(null);
      await fetchAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('failedToUpdateAccount'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      setDeleting(true);
      const res = await fetch(`/api/game-accounts/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t('failedToDeleteAccount'));

      toast.success(t('accountDeleted'));
      setDeleteTarget(null);
      await fetchAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('failedToDeleteAccount'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Game Accounts</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage the game accounts linked to your profile
          </p>
        </div>
        <Button onClick={openAddDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Account
        </Button>
      </div>

      {/* Accounts list */}
      <Card>
        <CardHeader>
          <CardTitle>Your Game Accounts</CardTitle>
          <CardDescription>
            {accounts.length === 0 && !loading
              ? 'No accounts added yet'
              : `${accounts.length} account${accounts.length !== 1 ? 's' : ''}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Gamepad2 className="h-12 w-12 text-gray-300 dark:text-gray-600" />
              <p className="font-medium text-gray-500 dark:text-gray-400">
                No game accounts yet
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Add your first game account to get started
              </p>
              <Button variant="outline" onClick={openAddDialog} className="mt-2 gap-2">
                <Plus className="h-4 w-4" />
                Add Account
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                >
                  {/* Game image / fallback icon */}
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                    {account.game_image ? (
                      <img
                        src={account.game_image}
                        alt={account.game_name ?? 'Game'}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Gamepad2 className="h-5 w-5 text-gray-400" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-gray-900 dark:text-white">
                        {account.account_identifier}
                      </span>
                      {account.game_name && (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {account.game_name}
                        </Badge>
                      )}
                    </div>
                    {account.account_email && (
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {account.account_email}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-gray-400">
                      Added {formatDate(account.created_at)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(account)}
                      className="gap-1"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteTarget(account)}
                      className="gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Game Account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-game">Game</Label>
              <Select
                value={form.game_id}
                onValueChange={(v) => setForm((f) => ({ ...f, game_id: v }))}
              >
                <SelectTrigger id="add-game">
                  <SelectValue placeholder="Select a game" />
                </SelectTrigger>
                <SelectContent>
                  {games.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-identifier">Account ID / Player ID</Label>
              <Input
                id="add-identifier"
                placeholder="e.g. 123456789"
                value={form.account_identifier}
                onChange={(e) => setForm((f) => ({ ...f, account_identifier: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-email">
                Email{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <Input
                id="add-email"
                type="email"
                placeholder="e.g. player@email.com"
                value={form.account_email}
                onChange={(e) => setForm((f) => ({ ...f, account_email: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-password">
                Account Password{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <div className="relative">
                <Input
                  id="add-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Leave blank to skip"
                  value={form.account_password}
                  onChange={(e) => setForm((f) => ({ ...f, account_password: e.target.value }))}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400">Passwords are securely encrypted before storage.</p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddDialog(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="gap-2">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Add Account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Game Account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            {editTarget?.game_name && (
              <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Game: <span className="font-medium text-gray-900 dark:text-white">{editTarget.game_name}</span>
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="edit-identifier">Account ID / Player ID</Label>
              <Input
                id="edit-identifier"
                placeholder="e.g. 123456789"
                value={form.account_identifier}
                onChange={(e) => setForm((f) => ({ ...f, account_identifier: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-email">
                Email{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="e.g. player@email.com"
                value={form.account_email}
                onChange={(e) => setForm((f) => ({ ...f, account_email: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-password">
                New Password{' '}
                <span className="text-gray-400 font-normal">(leave blank to keep current)</span>
              </Label>
              <div className="relative">
                <Input
                  id="edit-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="New password"
                  value={form.account_password}
                  onChange={(e) => setForm((f) => ({ ...f, account_password: e.target.value }))}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditTarget(null)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="gap-2">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Game Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the account{' '}
              <span className="font-semibold">{deleteTarget?.account_identifier}</span>
              {deleteTarget?.game_name ? ` for ${deleteTarget.game_name}` : ''}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 gap-2"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
