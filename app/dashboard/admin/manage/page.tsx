'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Plus, Trash2, Edit, Users, Image as ImageIcon } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Seller = { id: string; username: string; email: string };

type Game = {
  id: string;
  name: string;
  slug: string;
  assigned_sellers_count: number;
  assigned_sellers: Seller[];
};

type Category = {
  id: string;
  name: string;
  description?: string;
  game_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Product = {
  id: string;
  game_id: string | null;
  game_name: string;
  category_id?: string | null;
  category_name?: string | null;
  name: string;
  description?: string | null;
  image_url?: string | null;
  points_price?: number | null;
  is_active: boolean;
  created_at: string;
};

type ApiValidationDetail = { field?: string; message?: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatApiError(data: any, fallback: string): string {
  if (Array.isArray(data?.details) && data.details.length > 0) {
    return (data.details as ApiValidationDetail[])
      .map((d) => `${d.field ?? 'field'}: ${d.message ?? 'invalid value'}`)
      .join(' | ');
  }
  return data?.error || fallback;
}

const MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024;

// ─── Games Tab ────────────────────────────────────────────────────────────────

function GamesTab() {
  const [games, setGames] = useState<Game[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [selectedSellerIds, setSelectedSellerIds] = useState<string[]>([]);
  const [formData, setFormData] = useState({ name: '' });
  const [loadingGames, setLoadingGames] = useState(false);
  const [loadingSellers, setLoadingSellers] = useState(false);
  const [submittingGame, setSubmittingGame] = useState(false);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [removingSellerId, setRemovingSellerId] = useState<string | null>(null);
  const [removingGameId, setRemovingGameId] = useState<string | null>(null);
  const [selectedGameToDelete, setSelectedGameToDelete] = useState<Game | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteDialogError, setDeleteDialogError] = useState('');
  const [error, setError] = useState('');
  const [dialogError, setDialogError] = useState('');

  const availableSellers = useMemo(() => {
    const assignedIds = new Set(selectedGame?.assigned_sellers.map((s) => s.id) ?? []);
    return sellers.filter((s) => !assignedIds.has(s.id));
  }, [selectedGame, sellers]);

  const refreshGames = async () => {
    const res = await fetch('/api/admin/games', { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to refresh games');
    setGames(data.games ?? []);
    if (selectedGame) {
      setSelectedGame((data.games ?? []).find((g: Game) => g.id === selectedGame.id) ?? null);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) { setError('Authentication required'); return; }

    async function loadGames() {
      setLoadingGames(true);
      setError('');
      try {
        const res = await fetch('/api/admin/games', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unable to load games');
        setGames(data.games ?? []);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load games');
      } finally {
        setLoadingGames(false);
      }
    }
    loadGames();
  }, []);

  const loadSellers = async () => {
    setLoadingSellers(true);
    setDialogError('');
    try {
      const res = await fetch('/api/admin/sellers', { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load sellers');
      setSellers(data.sellers ?? []);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Failed to load sellers');
    } finally {
      setLoadingSellers(false);
    }
  };

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('auth_token');
    if (!token) { setError('Authentication required'); return; }
    setSubmittingGame(true);
    setError('');
    try {
      const res = await fetch('/api/admin/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to create game');
      setGames((c) => [data.game, ...c]);
      setFormData({ name: '' });
      toast.success('Game created successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game');
    } finally {
      setSubmittingGame(false);
    }
  };

  const openAssignDialog = async (game: Game) => {
    setSelectedGame(game);
    setSelectedSellerIds([]);
    setDialogError('');
    if (sellers.length === 0) await loadSellers();
  };

  const handleSaveAssignments = async () => {
    if (!selectedGame) return;
    setSavingAssignments(true);
    setDialogError('');
    try {
      const res = await fetch(`/api/admin/games/${selectedGame.id}/assign-sellers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ sellerIds: selectedSellerIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to assign sellers');
      await refreshGames();
      setSelectedSellerIds([]);
      toast.success('Sellers assigned successfully');
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Failed to assign sellers');
    } finally {
      setSavingAssignments(false);
    }
  };

  const handleRemoveSeller = async (sellerId: string) => {
    if (!selectedGame) return;
    setRemovingSellerId(sellerId);
    setDialogError('');
    try {
      const res = await fetch(`/api/admin/games/${selectedGame.id}/assign-sellers`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ sellerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to remove seller');
      await refreshGames();
      toast.success('Seller removed successfully');
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Failed to remove seller');
    } finally {
      setRemovingSellerId(null);
    }
  };

  const handleConfirmDeleteGame = async () => {
    if (!selectedGameToDelete) return;
    setRemovingGameId(selectedGameToDelete.id);
    setDeleteDialogError('');
    try {
      const res = await fetch(`/api/admin/games/${selectedGameToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to delete game');
      await refreshGames();
      if (selectedGame?.id === selectedGameToDelete.id) setSelectedGame(null);
      setDeleteDialogOpen(false);
      setSelectedGameToDelete(null);
      setDeleteDialogError('');
      toast.success(data.message || 'Game deleted successfully');
    } catch (err) {
      setDeleteDialogError(err instanceof Error ? err.message : 'Failed to delete game');
    } finally {
      setRemovingGameId(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-[#020617]">
          <CardHeader>
            <CardTitle className="text-black dark:text-white">Add Game</CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400">
              Add a new game to the marketplace and seller assignment pool.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreateGame}>
              <div className="space-y-2">
                <Label htmlFor="game-name" className="text-gray-700 dark:text-gray-300">Game Name</Label>
                <Input
                  id="game-name"
                  value={formData.name}
                  onChange={(e) => setFormData((c) => ({ ...c, name: e.target.value }))}
                  placeholder="Enter game name"
                  className="border-gray-300 bg-white text-black dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <Button type="submit" disabled={submittingGame} className="w-full sm:w-auto">
                {submittingGame ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {submittingGame ? 'Adding...' : 'Add Game'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {loadingGames ? (
            <Card className="rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-[#020617]">
              <CardContent className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading games...
                </div>
              </CardContent>
            </Card>
          ) : games.length > 0 ? (
            games.map((game) => (
              <Card key={game.id} className="rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-[#020617]">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-black dark:text-white">{game.name}</p>
                      <p className="truncate text-sm text-gray-500 dark:text-gray-400">{game.slug}</p>
                      <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                        <Users className="h-3.5 w-3.5" />
                        {game.assigned_sellers_count} seller{game.assigned_sellers_count === 1 ? '' : 's'} assigned
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Button variant="outline" className="w-full sm:w-auto" onClick={() => openAssignDialog(game)}>
                        Assign Sellers
                      </Button>
                      <Button
                        variant="destructive"
                        className="w-full sm:w-auto"
                        disabled={removingGameId === game.id}
                        onClick={() => { setSelectedGameToDelete(game); setDeleteDialogError(''); setDeleteDialogOpen(true); }}
                      >
                        {removingGameId === game.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Delete Game
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-[#020617]">
              <CardContent className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">No games found yet.</CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Assign Sellers Dialog */}
      <Dialog
        open={Boolean(selectedGame)}
        onOpenChange={(open) => {
          if (!open) { setSelectedGame(null); setSelectedSellerIds([]); setDialogError(''); }
        }}
      >
        <DialogContent className="max-w-[calc(100%-1.5rem)] rounded-xl border border-gray-200 bg-white text-black dark:border-gray-800 dark:bg-[#020617] dark:text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign Sellers</DialogTitle>
            <DialogDescription>Manage seller assignments for {selectedGame?.name}.</DialogDescription>
          </DialogHeader>
          {dialogError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{dialogError}</div>
          )}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-black dark:text-white">Assigned Sellers</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Remove sellers already linked to this game.</p>
              </div>
              <ScrollArea className="h-72 rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                <div className="space-y-3 p-4">
                  {selectedGame?.assigned_sellers.length ? (
                    selectedGame.assigned_sellers.map((seller) => (
                      <div key={seller.id} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-[#020617]">
                        <p className="font-medium text-black dark:text-white">{seller.username}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{seller.email}</p>
                        <Button
                          variant="outline"
                          className="mt-3 w-full sm:w-auto"
                          disabled={removingSellerId === seller.id}
                          onClick={() => handleRemoveSeller(seller.id)}
                        >
                          {removingSellerId === seller.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Remove
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400">No sellers assigned yet.</div>
                  )}
                </div>
              </ScrollArea>
            </div>
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-black dark:text-white">Available Sellers</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Select one or more sellers to add.</p>
              </div>
              <ScrollArea className="h-72 rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                <div className="space-y-3 p-4">
                  {loadingSellers ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading sellers...
                    </div>
                  ) : availableSellers.length ? (
                    availableSellers.map((seller) => {
                      const checked = selectedSellerIds.includes(seller.id);
                      return (
                        <label key={seller.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-[#020617]">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) =>
                              setSelectedSellerIds((c) => next ? [...c, seller.id] : c.filter((id) => id !== seller.id))
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-black dark:text-white">{seller.username}</p>
                            <p className="truncate text-sm text-gray-500 dark:text-gray-400">{seller.email}</p>
                          </div>
                        </label>
                      );
                    })
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400">No unassigned sellers available.</div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setSelectedGame(null); setSelectedSellerIds([]); setDialogError(''); }}>
              Close
            </Button>
            <Button className="w-full sm:w-auto" onClick={handleSaveAssignments} disabled={savingAssignments || selectedSellerIds.length === 0}>
              {savingAssignments ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {savingAssignments ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Game Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { if (!open) { setDeleteDialogOpen(false); setSelectedGameToDelete(null); setDeleteDialogError(''); } }}>
        <DialogContent className="max-w-[calc(100%-1.5rem)] rounded-xl border border-gray-200 bg-white text-black dark:border-gray-800 dark:bg-[#020617] dark:text-white sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Delete Game?</DialogTitle>
            <DialogDescription>
              This will permanently delete the game, its products, categories, seller assignments, and related game accounts if no active orders exist.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4 text-sm text-slate-500 dark:text-slate-300">
            <p>Are you sure you want to delete <strong>{selectedGameToDelete?.name}</strong>?</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Remove seller assignments for this game</li>
              <li>Delete all products listed under this game</li>
              <li>Delete categories tied to this game</li>
              <li>Delete game accounts for this game if there are no active orders</li>
            </ul>
            <p className="text-xs text-slate-400">The deletion will be blocked if any orders still depend on this game.</p>
            {deleteDialogError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{deleteDialogError}</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setDeleteDialogOpen(false); setSelectedGameToDelete(null); setDeleteDialogError(''); }}>
              Cancel
            </Button>
            <Button variant="destructive" className="w-full sm:w-auto" disabled={removingGameId === selectedGameToDelete?.id} onClick={handleConfirmDeleteGame}>
              {removingGameId === selectedGameToDelete?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete Game
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Categories Tab ───────────────────────────────────────────────────────────

function CategoriesTab() {
  const [games, setGames] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    fetch('/api/admin/games', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setGames(data.games ?? []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedGameId) return;
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    setLoading(true);
    fetch(`/api/admin/categories?gameId=${selectedGameId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedGameId]);

  const refreshCategories = async () => {
    if (!selectedGameId) return;
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    const res = await fetch(`/api/admin/categories?gameId=${selectedGameId}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setCategories(data.categories ?? []);
  };

  const handleAddEdit = async () => {
    if (!formData.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    try {
      const url = editingId ? `/api/admin/categories/${editingId}` : '/api/admin/categories';
      const method = editingId ? 'PATCH' : 'POST';
      const payload = editingId
        ? { name: formData.name, description: formData.description }
        : { name: formData.name, description: formData.description, game_id: selectedGameId };
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(editingId ? 'Category updated successfully' : 'Category created successfully');
        setIsOpen(false);
        setEditingId(null);
        setFormData({ name: '', description: '' });
        await refreshCategories();
      } else {
        toast.error(data.error || 'Failed to save category');
      }
    } catch {
      toast.error('Failed to save category');
    }
  };

  const handleDelete = async (categoryId: string) => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/categories/${categoryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Category deleted successfully');
        setDeleteId(null);
        setDeleteError(null);
        await refreshCategories();
      } else {
        if (data.inUse) {
          setDeleteError(data.error);
        } else {
          toast.error(data.error || 'Failed to delete category');
        }
        setDeleteId(null);
      }
    } catch {
      toast.error('Failed to delete category');
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>Select a game to view and manage its categories</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="cat-game-select" className="mb-2 block">Game</Label>
                <Select value={selectedGameId} onValueChange={setSelectedGameId}>
                  <SelectTrigger id="cat-game-select">
                    <SelectValue placeholder="Select a game..." />
                  </SelectTrigger>
                  <SelectContent>
                    {games.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedGameId && (
                <Button
                  onClick={() => { setEditingId(null); setFormData({ name: '', description: '' }); setIsOpen(true); }}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Category
                </Button>
              )}
            </div>

            {selectedGameId && (
              loading ? (
                <div className="py-8 text-center text-sm text-gray-500">Loading categories...</div>
              ) : categories.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">No categories yet. Create one to get started.</div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-200 dark:border-gray-800">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Name</th>
                        <th className="px-4 py-2 text-left font-medium">Description</th>
                        <th className="px-4 py-2 text-left font-medium">Status</th>
                        <th className="px-4 py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((cat) => (
                        <tr key={cat.id} className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900">
                          <td className="px-4 py-3">{cat.name}</td>
                          <td className="px-4 py-3 text-gray-500">{cat.description || '-'}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${cat.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                              {cat.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="ghost" onClick={() => { setEditingId(cat.id); setFormData({ name: cat.name, description: cat.description || '' }); setIsOpen(true); }}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <AlertDialog
                                open={deleteId === cat.id}
                                onOpenChange={(open) => { if (!open) { setDeleteId(null); setDeleteError(null); } }}
                              >
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                  onClick={() => setDeleteId(cat.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Category</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {deleteError || `Are you sure you want to delete "${cat.name}"? This action cannot be undone.`}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  {!deleteError ? (
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDelete(cat.id)} className="bg-red-600 hover:bg-red-700">
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  ) : (
                                    <AlertDialogFooter><AlertDialogCancel>Close</AlertDialogCancel></AlertDialogFooter>
                                  )}
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Category Dialog */}
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { setEditingId(null); setFormData({ name: '', description: '' }); } setIsOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit' : 'Add'} Category</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update the category details' : 'Create a new category for this game'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cat-name">Category Name</Label>
              <Input
                id="cat-name"
                placeholder="e.g., Accounts, Resources, UC"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="cat-desc">Description (Optional)</Label>
              <Input
                id="cat-desc"
                placeholder="e.g., Game accounts and login credentials"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={handleAddEdit}>{editingId ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Products Tab ─────────────────────────────────────────────────────────────

function ProductsTab() {
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [games, setGames] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const emptyForm = { game_id: '', category_id: '', name: '', points_price: '' };
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');

  async function loadProducts() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/products', { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data, 'Failed to load products'));
      setProducts(data.products ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }

  async function loadGames() {
    try {
      const res = await fetch('/api/games');
      const data = await res.json();
      setGames(data.games ?? []);
    } catch {
      toast.error('Failed to load games');
    }
  }

  async function loadCategories(gameId: string) {
    if (!gameId) { setCategories([]); return; }
    try {
      const res = await fetch(`/api/games/${gameId}/categories`);
      const data = await res.json();
      setCategories(data.categories ?? []);
    } catch {
      toast.error('Failed to load categories');
    }
  }

  useEffect(() => { loadProducts(); loadGames(); }, []);

  useEffect(() => {
    if (!form.game_id) { setCategories([]); setForm((f) => ({ ...f, category_id: '' })); return; }
    loadCategories(form.game_id);
  }, [form.game_id]);

  useEffect(() => {
    if (!imageFile) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.game_id || !form.category_id || !form.name || !form.points_price || !imageFile) {
      toast.error('Game, category, product name, price, and image are required');
      return;
    }
    if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
      toast.error('Image size must be 25MB or less');
      return;
    }
    setCreating(true);
    try {
      const payload = new FormData();
      payload.append('game_id', form.game_id);
      payload.append('category_id', form.category_id);
      payload.append('name', form.name);
      payload.append('points_price', String(Number(form.points_price)));
      payload.append('image_file', imageFile);
      const res = await fetch('/api/admin/products', { method: 'POST', headers: authHeaders(), body: payload });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data, 'Failed to create product'));
      toast.success('Product added successfully');
      setForm(emptyForm);
      setImageFile(null);
      setPreviewUrl('');
      setShowCreate(false);
      await loadProducts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create product');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('createProductsDefaultOffer')}</p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)} size="sm">
          <Plus size={16} className="mr-2" /> {t('newProduct')}
        </Button>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div className="text-sm text-gray-600 dark:text-gray-300">{t('totalProducts')}</div>
          <div className="text-lg font-semibold text-black dark:text-white">{products.length}</div>
        </CardContent>
      </Card>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('addProduct')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('game')}</label>
                <select
                  value={form.game_id}
                  onChange={(e) => setForm((f) => ({ ...f, game_id: e.target.value }))}
                  className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  required
                >
                  <option value="">{t('selectGame')}</option>
                  {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('category')}</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                  className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  required
                  disabled={!form.game_id || categories.length === 0}
                >
                  <option value="">{t('selectCategory')}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('productName')}</label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Ranked Boost" required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('pricePoints')}</label>
                <Input type="number" min={1} value={form.points_price} onChange={(e) => setForm((f) => ({ ...f, points_price: e.target.value }))} placeholder="e.g. 500" required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('imageFileMax')}</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {imageFile ? `${imageFile.name} (${(imageFile.size / (1024 * 1024)).toFixed(2)} MB)` : t('acceptedFormats')}
                </p>
              </div>
              {previewUrl && (
                <div className="sm:col-span-2 lg:col-span-4 flex flex-col gap-2">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('preview')}</label>
                  <img src={previewUrl} alt="Product preview" className="h-48 w-full rounded-md border border-gray-200 object-cover dark:border-gray-700" />
                </div>
              )}
              <div className="sm:col-span-2 lg:col-span-4 flex items-end gap-2">
                <Button type="submit" disabled={creating} size="sm">
                  {creating ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Plus size={14} className="mr-2" />}
                  {t('addProduct')}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setShowCreate(false); setForm(emptyForm); setImageFile(null); setPreviewUrl(''); }}>
                  {t('cancel')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : products.length === 0 ? (
            <div className="py-16 text-center text-gray-400">{t('noProductsYet')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left dark:border-gray-800 dark:bg-gray-900">
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('game')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('category')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('products')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('price')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('image')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {products.map((product) => (
                    <tr key={product.id} className="bg-white transition-colors hover:bg-gray-50 dark:bg-gray-950 dark:hover:bg-gray-900">
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{product.game_name || '-'}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{product.category_name || '-'}</td>
                      <td className="px-4 py-3 font-medium text-black dark:text-white">{product.name}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {typeof product.points_price === 'number' ? `${product.points_price.toLocaleString()} pts` : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {product.image_url ? (
                          <a href={product.image_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                            <ImageIcon size={14} /> {t('open')}
                          </a>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={product.is_active ? 'default' : 'secondary'}>{product.is_active ? t('active') : t('inactive')}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AdminManagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam === 'categories' || tabParam === 'products' ? tabParam : 'games';

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/dashboard');
    }
  }, [user, router]);

  if (!user || user.role !== 'admin') {
    return null;
  }

  return (
    <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-black dark:text-white sm:text-3xl">Content Management</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 sm:text-base">
          Manage games, categories, and products from one place.
        </p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList className="mb-6 h-auto w-full justify-start gap-1 rounded-xl p-1 sm:w-auto">
          <TabsTrigger value="games" className="rounded-lg px-4 py-2 text-sm font-medium">
            Games
          </TabsTrigger>
          <TabsTrigger value="categories" className="rounded-lg px-4 py-2 text-sm font-medium">
            Categories
          </TabsTrigger>
          <TabsTrigger value="products" className="rounded-lg px-4 py-2 text-sm font-medium">
            Products
          </TabsTrigger>
        </TabsList>

        <TabsContent value="games">
          <GamesTab />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesTab />
        </TabsContent>
        <TabsContent value="products">
          <ProductsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
