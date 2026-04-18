'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogTrigger,
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
import { Trash2, Edit, Plus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Game {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  description?: string;
  game_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function CategoriesPage() {
  const { user } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

  // Redirect if not admin
  useEffect(() => {
    if (user && user.role !== 'admin') {
      window.location.href = '/dashboard';
    }
  }, [user]);

  // Fetch games
  useEffect(() => {
    if (!token) return;

    async function fetchGames() {
      try {
        const res = await fetch('/api/admin/games', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setGames(data.games ?? []);
        }
      } catch (error) {
        console.error('Error fetching games:', error);
        toast({
          title: 'Error',
          description: 'Failed to load games',
          variant: 'destructive',
        });
      }
    }

    fetchGames();
  }, [token]);

  // Fetch categories when game is selected
  useEffect(() => {
    if (!selectedGameId || !token) return;

    async function fetchCategories() {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/categories?gameId=${selectedGameId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCategories(data.categories ?? []);
        }
      } catch (error) {
        console.error('Error fetching categories:', error);
        toast({
          title: 'Error',
          description: 'Failed to load categories',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    }

    fetchCategories();
  }, [selectedGameId, token]);

  const handleAddEdit = async () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'Category name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      const url = editingId
        ? `/api/admin/categories/${editingId}`
        : '/api/admin/categories';
      const method = editingId ? 'PATCH' : 'POST';

      const payload = editingId
        ? { name: formData.name, description: formData.description }
        : { name: formData.name, description: formData.description, game_id: selectedGameId };

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        toast({
          title: 'Success',
          description: editingId
            ? 'Category updated successfully'
            : 'Category created successfully',
        });
        setIsOpen(false);
        setEditingId(null);
        setFormData({ name: '', description: '' });
        // Refresh categories
        if (selectedGameId) {
          const refreshRes = await fetch(`/api/admin/categories?gameId=${selectedGameId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            setCategories(refreshData.categories ?? []);
          }
        }
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to save category',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error saving category:', error);
      toast({
        title: 'Error',
        description: 'Failed to save category',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    setFormData({
      name: category.name,
      description: category.description || '',
    });
    setIsOpen(true);
  };

  const handleDelete = async (categoryId: string) => {
    try {
      const res = await fetch(`/api/admin/categories/${categoryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (res.ok) {
        toast({
          title: 'Success',
          description: 'Category deleted successfully',
        });
        setDeleteId(null);
        setDeleteError(null);
        // Refresh categories
        if (selectedGameId) {
          const refreshRes = await fetch(`/api/admin/categories?gameId=${selectedGameId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            setCategories(refreshData.categories ?? []);
          }
        }
      } else {
        if (data.inUse) {
          setDeleteError(data.error);
        } else {
          toast({
            title: 'Error',
            description: data.error || 'Failed to delete category',
            variant: 'destructive',
          });
        }
        setDeleteId(null);
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete category',
        variant: 'destructive',
      });
      setDeleteId(null);
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      setEditingId(null);
      setFormData({ name: '', description: '' });
    }
    setIsOpen(open);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Category Management</h1>
        <p className="text-gray-500 mt-2">Manage product categories for each game</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>Select a game to view and manage its categories</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Game Selector */}
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <Label htmlFor="game-select" className="mb-2 block">
                  Game
                </Label>
                <Select value={selectedGameId} onValueChange={setSelectedGameId}>
                  <SelectTrigger id="game-select">
                    <SelectValue placeholder="Select a game..." />
                  </SelectTrigger>
                  <SelectContent>
                    {games.map((game) => (
                      <SelectItem key={game.id} value={game.id}>
                        {game.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedGameId && (
                <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
                  <DialogTrigger asChild>
                    <Button
                      onClick={() => {
                        setEditingId(null);
                        setFormData({ name: '', description: '' });
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Category
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingId ? 'Edit' : 'Add'} Category</DialogTitle>
                      <DialogDescription>
                        {editingId
                          ? 'Update the category details'
                          : 'Create a new category for this game'}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="name">Category Name</Label>
                        <Input
                          id="name"
                          placeholder="e.g., Accounts, Resources, UC"
                          value={formData.name}
                          onChange={(e) =>
                            setFormData({ ...formData, name: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="description">Description (Optional)</Label>
                        <Input
                          id="description"
                          placeholder="e.g., Game accounts and login credentials"
                          value={formData.description}
                          onChange={(e) =>
                            setFormData({ ...formData, description: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddEdit}>
                        {editingId ? 'Update' : 'Create'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            {/* Categories Table */}
            {selectedGameId && (
              <div>
                {loading ? (
                  <div className="text-center py-8 text-gray-500">Loading categories...</div>
                ) : categories.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No categories yet. Create one to get started.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="text-left py-2 px-4 font-medium">Name</th>
                          <th className="text-left py-2 px-4 font-medium">Description</th>
                          <th className="text-left py-2 px-4 font-medium">Status</th>
                          <th className="text-right py-2 px-4 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categories.map((category) => (
                          <tr key={category.id} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4">{category.name}</td>
                            <td className="py-3 px-4 text-gray-500">
                              {category.description || '-'}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  category.is_active
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {category.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEdit(category)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <AlertDialog
                                  open={deleteId === category.id}
                                  onOpenChange={(open) => {
                                    if (!open) {
                                      setDeleteId(null);
                                      setDeleteError(null);
                                    }
                                  }}
                                >
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => setDeleteId(category.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Category</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        {deleteError
                                          ? deleteError
                                          : `Are you sure you want to delete "${category.name}"? This action cannot be undone.`}
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    {!deleteError && (
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleDelete(category.id)}
                                          className="bg-red-600 hover:bg-red-700"
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    )}
                                    {deleteError && (
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Close</AlertDialogCancel>
                                      </AlertDialogFooter>
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
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
