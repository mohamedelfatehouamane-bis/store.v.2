'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type Offer = {
  id: string;
  name: string;
  product_id: string;
  product_name: string;
  category_id: string | null;
  category_name: string;
  game_id: string;
  game_name: string;
  quantity: number;
  unit: string;
  points_price: number;
  is_active: boolean;
  created_at: string;
};

type Game = {
  id: string;
  name: string;
};

const emptyForm = { game_id: '', name: '', quantity: '', unit: '', points_price: '' };

export default function AdminOffersPage() {
  const { user } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', quantity: '', unit: '', points_price: '' });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';

  function authHeaders(): Record<string, string> {
    const token = localStorage.getItem('auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function loadOffers() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/offers', { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load offers');
      setOffers(data.offers ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load offers');
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

  useEffect(() => {
    if (!isAdmin) return;
    loadOffers();
    loadGames();
  }, [isAdmin]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.game_id || !form.name || !form.quantity || !form.unit || !form.points_price) {
      toast.error('All fields are required');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          game_id: form.game_id,
          name: form.name,
          quantity: Number(form.quantity),
          unit: form.unit,
          points_price: Number(form.points_price),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create offer');
      toast.success('Offer created');
      setForm(emptyForm);
      setShowCreate(false);
      await loadOffers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create offer');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(offer: Offer) {
    setEditingId(offer.id);
    setEditForm({
      name: offer.name,
      quantity: String(offer.quantity),
      unit: offer.unit,
      points_price: String(offer.points_price),
    });
  }

  async function handleSaveEdit(id: string) {
    if (!editForm.name || !editForm.quantity || !editForm.unit || !editForm.points_price) {
      toast.error('All fields are required');
      return;
    }
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/offers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name: editForm.name,
          quantity: Number(editForm.quantity),
          unit: editForm.unit,
          points_price: Number(editForm.points_price),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to update offer');
      toast.success('Offer updated');
      setEditingId(null);
      await loadOffers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update offer');
    } finally {
      setSavingId(null);
    }
  }

  async function handleToggle(offer: Offer) {
    setTogglingId(offer.id);
    try {
      const res = await fetch(`/api/admin/offers/${offer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ is_active: !offer.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to toggle offer');
      toast.success(offer.is_active ? 'Offer deactivated' : 'Offer activated');
      await loadOffers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to toggle offer');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this offer? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/offers/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to delete offer');
      toast.success('Offer deleted');
      setOffers((prev) => prev.filter((o) => o.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete offer');
    } finally {
      setDeletingId(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-gray-500">
        Access restricted to admins only.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white">Manage Offers</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Create, edit, and toggle offers visible to customers.
          </p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)} variant="default" size="sm">
          <Plus size={16} className="mr-2" />
          New Offer
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create New Offer</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Game</label>
                <select
                  value={form.game_id}
                  onChange={(e) => setForm((f) => ({ ...f, game_id: e.target.value }))}
                  className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  required
                >
                  <option value="">Select a game…</option>
                  {games.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Offer Name</label>
                <Input
                  placeholder="e.g. 100 Diamonds Pack"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Quantity</label>
                <Input
                  type="number"
                  min={1}
                  placeholder="e.g. 100"
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Unit</label>
                <Input
                  placeholder="e.g. diamonds, coins"
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Points Price</label>
                <Input
                  type="number"
                  min={1}
                  placeholder="e.g. 500"
                  value={form.points_price}
                  onChange={(e) => setForm((f) => ({ ...f, points_price: e.target.value }))}
                  required
                />
              </div>
              <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
                <Button type="submit" disabled={creating} size="sm">
                  {creating ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Check size={14} className="mr-2" />}
                  Create
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowCreate(false); setForm(emptyForm); }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Offers table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : offers.length === 0 ? (
            <div className="py-16 text-center text-gray-400">No offers yet. Create one above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left dark:border-gray-800 dark:bg-gray-900">
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Game</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Category</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Offer Name</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Quantity</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Unit</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Points Price</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Status</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {offers.map((offer) => (
                    <tr
                      key={offer.id}
                      className="bg-white transition-colors hover:bg-gray-50 dark:bg-gray-950 dark:hover:bg-gray-900"
                    >
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{offer.game_name}</td>

                      {editingId === offer.id ? (
                        <>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{offer.category_name || 'Uncategorized'}</td>
                          <td className="px-4 py-3">
                            <Input
                              className="h-8 w-40 text-sm"
                              value={editForm.name}
                              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              type="number"
                              min={1}
                              className="h-8 w-24 text-sm"
                              value={editForm.quantity}
                              onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              className="h-8 w-28 text-sm"
                              value={editForm.unit}
                              onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              type="number"
                              min={1}
                              className="h-8 w-24 text-sm"
                              value={editForm.points_price}
                              onChange={(e) => setEditForm((f) => ({ ...f, points_price: e.target.value }))}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={offer.is_active ? 'default' : 'secondary'}>
                              {offer.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                disabled={savingId === offer.id}
                                onClick={() => handleSaveEdit(offer.id)}
                                className="h-8 px-2"
                              >
                                {savingId === offer.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Check size={13} />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingId(null)}
                                className="h-8 px-2"
                              >
                                <X size={13} />
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{offer.category_name || 'Uncategorized'}</td>
                          <td className="px-4 py-3 font-medium text-black dark:text-white">{offer.name || '—'}</td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{offer.quantity}</td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{offer.unit}</td>
                          <td className="px-4 py-3 font-semibold text-black dark:text-white">
                            {offer.points_price.toLocaleString()} pts
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={offer.is_active ? 'default' : 'secondary'}>
                              {offer.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Edit"
                                onClick={() => startEdit(offer)}
                                className="h-8 px-2"
                              >
                                <Pencil size={13} />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title={offer.is_active ? 'Deactivate' : 'Activate'}
                                disabled={togglingId === offer.id}
                                onClick={() => handleToggle(offer)}
                                className="h-8 px-2"
                              >
                                {togglingId === offer.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : offer.is_active ? (
                                  <ToggleRight size={16} className="text-green-600" />
                                ) : (
                                  <ToggleLeft size={16} className="text-gray-400" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Delete"
                                disabled={deletingId === offer.id}
                                onClick={() => handleDelete(offer.id)}
                                className="h-8 px-2 text-red-500 hover:text-red-600"
                              >
                                {deletingId === offer.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Trash2 size={13} />
                                )}
                              </Button>
                            </div>
                          </td>
                        </>
                      )}
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

