'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Plus, Trash2, Users } from 'lucide-react';

type Seller = {
  id: string;
  username: string;
  email: string;
};

type Game = {
  id: string;
  name: string;
  slug: string;
  assigned_sellers_count: number;
  assigned_sellers: Seller[];
};

export default function GamesPage() {
  const { user } = useAuth();
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

  const isAdmin = user?.role === 'admin';

  const availableSellers = useMemo(() => {
    const assignedIds = new Set(selectedGame?.assigned_sellers.map((seller) => seller.id) ?? []);
    return sellers.filter((seller) => !assignedIds.has(seller.id));
  }, [selectedGame, sellers]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setError('Authentication required');
      return;
    }

    async function loadGames() {
      setLoadingGames(true);
      setError('');

      try {
        const response = await fetch('/api/admin/games', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Unable to load games');
        }

        setGames(data.games ?? []);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load games');
      } finally {
        setLoadingGames(false);
      }
    }

    loadGames();
  }, [isAdmin]);

  const loadSellers = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setDialogError('Authentication required');
      return;
    }

    setLoadingSellers(true);
    setDialogError('');

    try {
      const response = await fetch('/api/admin/sellers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to load sellers');
      }

      setSellers(data.sellers ?? []);
    } catch (err) {
      console.error(err);
      setDialogError(err instanceof Error ? err.message : 'Failed to load sellers');
    } finally {
      setLoadingSellers(false);
    }
  };

  const refreshGames = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      return;
    }

    const response = await fetch('/api/admin/games', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Unable to refresh games');
    }

    setGames(data.games ?? []);
    if (selectedGame) {
      const nextSelectedGame = (data.games ?? []).find((game: Game) => game.id === selectedGame.id) ?? null;
      setSelectedGame(nextSelectedGame);
    }
  };

  const handleCreateGame = async (event: React.FormEvent) => {
    event.preventDefault();

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setError('Authentication required');
      return;
    }

    setSubmittingGame(true);
    setError('');

    try {
      const response = await fetch('/api/admin/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to create game');
      }

      setGames((current) => [data.game, ...current]);
      setFormData({ name: '' });
      toast.success('Game created successfully');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to create game');
    } finally {
      setSubmittingGame(false);
    }
  };

  const openAssignDialog = async (game: Game) => {
    setSelectedGame(game);
    setSelectedSellerIds([]);
    setDialogError('');

    if (sellers.length === 0) {
      await loadSellers();
    }
  };

  const handleSaveAssignments = async () => {
    if (!selectedGame) {
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setDialogError('Authentication required');
      return;
    }

    setSavingAssignments(true);
    setDialogError('');

    try {
      const response = await fetch(`/api/admin/games/${selectedGame.id}/assign-sellers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sellerIds: selectedSellerIds }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to assign sellers');
      }

      await refreshGames();
      setSelectedSellerIds([]);
      toast.success('Sellers assigned successfully');
    } catch (err) {
      console.error(err);
      setDialogError(err instanceof Error ? err.message : 'Failed to assign sellers');
    } finally {
      setSavingAssignments(false);
    }
  };

  const openDeleteDialog = (game: Game) => {
    setSelectedGameToDelete(game);
    setDeleteDialogError('');
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setSelectedGameToDelete(null);
    setDeleteDialogError('');
  };

  const handleConfirmDeleteGame = async () => {
    if (!selectedGameToDelete) {
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setDeleteDialogError('Authentication required');
      return;
    }

    setRemovingGameId(selectedGameToDelete.id);
    setDeleteDialogError('');

    try {
      const response = await fetch(`/api/admin/games/${selectedGameToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to delete game');
      }

      await refreshGames();
      if (selectedGame?.id === selectedGameToDelete.id) {
        setSelectedGame(null);
      }
      closeDeleteDialog();
      toast.success(data.message || 'Game deleted successfully');
    } catch (err) {
      console.error(err);
      setDeleteDialogError(err instanceof Error ? err.message : 'Failed to delete game');
    } finally {
      setRemovingGameId(null);
    }
  };

  const handleRemoveSeller = async (sellerId: string) => {
    if (!selectedGame) {
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setDialogError('Authentication required');
      return;
    }

    setRemovingSellerId(sellerId);
    setDialogError('');

    try {
      const response = await fetch(`/api/admin/games/${selectedGame.id}/assign-sellers`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sellerId }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to remove seller');
      }

      await refreshGames();
      toast.success('Seller removed successfully');
    } catch (err) {
      console.error(err);
      setDialogError(err instanceof Error ? err.message : 'Failed to remove seller');
    } finally {
      setRemovingSellerId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl font-bold text-black dark:text-white sm:text-3xl">Games Management</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 sm:text-base">Only admins can manage games and seller assignments.</p>
        </div>
        <Card className="rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-[#020617]">
          <CardContent className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            You do not have permission to access this page.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-black dark:text-white sm:text-3xl">Games Management</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 sm:text-base">
          Create games and assign verified sellers to the right categories.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
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
                  onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
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
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading games...
                </div>
              </CardContent>
            </Card>
          ) : games.length > 0 ? (
            games.map((game) => (
              <Card key={game.id} className="rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-[#020617]">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold text-black dark:text-white">{game.name}</p>
                        <p className="truncate text-sm text-gray-500 dark:text-gray-400">{game.slug}</p>
                        <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                          <Users className="h-3.5 w-3.5" />
                          {game.assigned_sellers_count} seller{game.assigned_sellers_count === 1 ? '' : 's'} assigned
                        </div>
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
                        onClick={() => openDeleteDialog(game)}
                      >
                        {removingGameId === game.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        Delete Game
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-[#020617]">
              <CardContent className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                No games found yet.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(selectedGame)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedGame(null);
            setSelectedSellerIds([]);
            setDialogError('');
          }
        }}
      >
        <DialogContent className="max-w-[calc(100%-1.5rem)] rounded-xl border border-gray-200 bg-white text-black dark:border-gray-800 dark:bg-[#020617] dark:text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign Sellers</DialogTitle>
            <DialogDescription>
              Manage seller assignments for {selectedGame?.name}. Add new sellers or remove existing assignments.
            </DialogDescription>
          </DialogHeader>

          {dialogError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {dialogError}
            </div>
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
                          {removingSellerId === seller.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
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
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading sellers...
                    </div>
                  ) : availableSellers.length ? (
                    availableSellers.map((seller) => {
                      const checked = selectedSellerIds.includes(seller.id);

                      return (
                        <label
                          key={seller.id}
                          className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-[#020617]"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(nextChecked) => {
                              setSelectedSellerIds((current) =>
                                nextChecked
                                  ? [...current, seller.id]
                                  : current.filter((id) => id !== seller.id)
                              );
                            }}
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
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setSelectedGame(null);
                setSelectedSellerIds([]);
                setDialogError('');
              }}
            >
              Close
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={handleSaveAssignments}
              disabled={savingAssignments || selectedSellerIds.length === 0}
            >
              {savingAssignments ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {savingAssignments ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeDeleteDialog();
          }
        }}
      >
        <DialogContent className="max-w-[calc(100%-1.5rem)] rounded-xl border border-gray-200 bg-white text-black dark:border-gray-800 dark:bg-[#020617] dark:text-white sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Delete Game?</DialogTitle>
            <DialogDescription>
              This will permanently delete the game, its products, categories, seller assignments, and related game accounts if no active orders exist.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4 text-sm text-slate-500 dark:text-slate-300">
            <p>
              Are you sure you want to delete <strong>{selectedGameToDelete?.name}</strong>?
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Remove seller assignments for this game</li>
              <li>Delete all products listed under this game</li>
              <li>Delete categories tied to this game</li>
              <li>Delete game accounts for this game if there are no active orders</li>
            </ul>
            <p className="text-xs text-slate-400">
              The deletion will be blocked if any orders still depend on this game.
            </p>
            {deleteDialogError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                {deleteDialogError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" className="w-full sm:w-auto" onClick={closeDeleteDialog}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              disabled={removingGameId === selectedGameToDelete?.id}
              onClick={handleConfirmDeleteGame}
            >
              {removingGameId === selectedGameToDelete?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete Game
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
