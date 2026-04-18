'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field';
import { SellerRating } from '@/components/seller-rating';
import SellerBadge from '@/components/seller-badge';

type GameItem = {
  id: string;
  name: string;
};

type SellerItem = {
  id: string;
  username: string;
  avatar_url?: string | null;
  business_name?: string | null;
  business_description?: string | null;
  total_tasks_completed?: number;
  average_rating?: number;
  total_reviews?: number;
  completed_orders?: number;
  dispute_count?: number;
  trust_score?: number;
  trust_badge?: 'top' | 'trusted' | 'warning';
  is_risky?: boolean;
  total_points?: number;
  assigned_games?: string | null;
};

type GameAccountItem = {
  id: string;
  game_name: string;
  account_identifier: string;
};

type OfferItem = {
  offer_id: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
};

export default function PostTaskPage() {
  const [formData, setFormData] = useState({
    game: '',
    title: '',
    description: '',
    budget_min: '',
    budget_max: '',
    timeline: '',
  });
  const [selectedGame, setSelectedGame] = useState('');
  const [games, setGames] = useState<GameItem[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [sellers, setSellers] = useState<SellerItem[]>([]);
  const [sellersLoading, setSellersLoading] = useState(false);
  const [sellersError, setSellersError] = useState<string | null>(null);
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [selectedSellerName, setSelectedSellerName] = useState('');
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersError, setOffersError] = useState<string | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [gameAccounts, setGameAccounts] = useState<GameAccountItem[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderMessage, setOrderMessage] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function loadGames() {
      setGamesLoading(true);
      setGamesError(null);

      try {
        const response = await fetch('/api/games');
        console.log('Games API response', response);
        const data = await response.json();
        console.log('Games API payload', data);

        if (!response.ok) {
          setGamesError(data?.error || 'Unable to load games');
          setGames([]);
          return;
        }

        const gamesData = (data.games ?? []) as GameItem[];
        setGames(gamesData);
      } catch (error) {
        console.error('Unable to load game options', error);
        setGamesError('Unable to load games');
        setGames([]);
      } finally {
        setGamesLoading(false);
      }
    }

    loadGames();
  }, []);

  useEffect(() => {
    async function loadGameAccounts() {
      setAccountsLoading(true);
      setAccountsError(null);

      try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
          setAccountsError('Missing auth token');
          setGameAccounts([]);
          return;
        }

        const response = await fetch('/api/game-accounts', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();
        if (!response.ok) {
          setAccountsError(data?.error || 'Unable to load game accounts');
          setGameAccounts([]);
          return;
        }

        setGameAccounts((data.accounts ?? []) as GameAccountItem[]);
      } catch (error) {
        console.error('Unable to load game accounts', error);
        setAccountsError('Unable to load game accounts');
        setGameAccounts([]);
      } finally {
        setAccountsLoading(false);
      }
    }

    loadGameAccounts();
  }, []);

  useEffect(() => {
    if (!selectedGame) {
      setSellers([]);
      setSellersError(null);
      setSellersLoading(false);
      setSelectedSellerId('');
      setSelectedSellerName('');
      return;
    }

    async function loadSellers() {
      setSellersLoading(true);
      setSellersError(null);

      try {
        const response = await fetch(`/api/sellers?gameId=${encodeURIComponent(selectedGame)}`);
        console.log('Sellers API response', response);
        const data = await response.json();
        console.log('Sellers API payload', data);

        if (!response.ok) {
          setSellersError(data?.error || 'Unable to load sellers');
          setSellers([]);
          return;
        }

        setSellers((data.sellers ?? []) as SellerItem[]);
      } catch (error) {
        console.error('Unable to load sellers', error);
        setSellersError('Unable to load sellers');
        setSellers([]);
      } finally {
        setSellersLoading(false);
      }
    }

    loadSellers();
  }, [selectedGame]);

  useEffect(() => {
    if (!selectedSellerId) {
      setOffers([]);
      setOffersError(null);
      setOffersLoading(false);
      setSelectedOfferId('');
      return;
    }

    async function loadOffers() {
      setOffersLoading(true);
      setOffersError(null);

      try {
        const response = await fetch(
          `/api/offers?gameId=${encodeURIComponent(selectedGame)}&sellerId=${encodeURIComponent(selectedSellerId)}`
        );
        console.log('Offers API response', response);
        const data = await response.json();
        console.log('Offers API payload', data);

        if (!response.ok) {
          setOffersError(data?.error || 'Unable to load offers');
          setOffers([]);
          return;
        }

        setOffers((data.offers ?? []) as OfferItem[]);
      } catch (error) {
        console.error('Unable to load offers', error);
        setOffersError('Unable to load offers');
        setOffers([]);
      } finally {
        setOffersLoading(false);
      }
    }

    loadOffers();
  }, [selectedGame, selectedSellerId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('Task request draft saved locally. Order submission will be available in the next release.');
  };

  const handleCreateOrder = async () => {
    setOrderLoading(true);
    setOrderError(null);
    setOrderMessage(null);

    if (!selectedGame || !selectedSellerId || !selectedOfferId || !selectedAccountId) {
      setOrderError('Please select game, seller, offer, and account before creating the order.');
      setOrderLoading(false);
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setOrderError('Authentication required.');
      setOrderLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          game_id: selectedGame,
          seller_id: selectedSellerId,
          offer_id: selectedOfferId,
          account_id: selectedAccountId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setOrderError(data?.error || 'Unable to create order');
        return;
      }

      setOrderMessage(data?.message || 'Order created successfully.');
      setOrderError(null);
    } catch (error) {
      console.error('Create order failed:', error);
      setOrderError('Unable to create order');
    } finally {
      setOrderLoading(false);
    }
  };

  return (
    <div className="flex-1 p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Post a New Task</h1>
        <p className="text-slate-600 mt-2">Create a request and let sellers submit offers for your game service.</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Task Details</CardTitle>
          <CardDescription>Fill in the details about your gaming task.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <FieldGroup>
              <Field>
                <FieldLabel>Game</FieldLabel>
                <select
                  name="game"
                  value={selectedGame}
                  onChange={(e) => {
                    const gameId = e.target.value;
                    setSelectedGame(gameId);
                    setFormData((prev) => ({
                      ...prev,
                      game: gameId,
                    }));
                    setSelectedSellerId('');
                    setSelectedSellerName('');
                    setOffers([]);
                    setSelectedOfferId('');
                    setSelectedAccountId('');
                    setOrderMessage(null);
                    setOrderError(null);
                  }}
                  required
                  disabled={gamesLoading || !!gamesError || games.length === 0}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <option value="" disabled>
                    {gamesLoading ? 'Loading games...' : games.length === 0 ? 'No games available' : 'Select a game'}
                  </option>
                  {!gamesLoading && games.length > 0 &&
                    games.map((game) => (
                      <option key={game.id} value={game.id}>
                        {game.name}
                      </option>
                    ))}
                </select>
                {gamesError ? (
                  <p className="mt-2 text-sm text-red-600">{gamesError}</p>
                ) : null}
              </Field>
            </FieldGroup>

            {selectedGame ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Available sellers</p>
                    <p className="text-xs text-slate-500">Sellers who support the selected game</p>
                  </div>
                  {sellersLoading ? (
                    <span className="text-sm text-slate-500">Loading sellers...</span>
                  ) : null}
                </div>

                {sellersError ? (
                  <p className="text-sm text-red-600">{sellersError}</p>
                ) : sellersLoading ? (
                  <p className="text-sm text-slate-500">Loading sellers...</p>
                ) : sellers.length === 0 ? (
                  <p className="text-sm text-slate-500">No sellers available for this game.</p>
                ) : (
                  <div className="space-y-3">
                    {sellers.map((seller) => (
                      <div
                        key={seller.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedSellerId(seller.id);
                          setSelectedSellerName(seller.business_name || seller.username);
                          setOffers([]);
                          setSelectedOfferId('');
                          setOffersError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setSelectedSellerId(seller.id);
                            setSelectedSellerName(seller.business_name || seller.username);
                            setOffers([]);
                            setSelectedOfferId('');
                            setOffersError(null);
                          }
                        }}
                        className={`rounded-lg border p-3 cursor-pointer transition ${
                          seller.id === selectedSellerId
                            ? 'border-blue-500 bg-sky-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-900">{seller.business_name || seller.username}</p>
                            <p className="text-sm text-slate-600">{seller.business_description || 'No description available.'}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <SellerBadge seller={seller} />
                              <span className="text-xs text-slate-500">Trust: {Number(seller.trust_score ?? 0).toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <SellerRating avgRating={seller.average_rating} totalReviews={seller.total_reviews} size="sm" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {selectedSellerId ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Seller offers</p>
                    <p className="text-xs text-slate-500">Choose an offer for {selectedSellerName || 'this seller'}</p>
                  </div>
                  {offersLoading ? (
                    <span className="text-sm text-slate-500">Loading offers...</span>
                  ) : null}
                </div>

                {offersError ? (
                  <p className="text-sm text-red-600">{offersError}</p>
                ) : offersLoading ? (
                  <p className="text-sm text-slate-500">Loading offers...</p>
                ) : offers.length === 0 ? (
                  <p className="text-sm text-slate-500">No offers found for this seller and game.</p>
                ) : (
                  <div className="grid gap-3">
                    {offers.map((offer) => (
                      <button
                        key={offer.offer_id}
                        type="button"
                        onClick={() => setSelectedOfferId(offer.offer_id)}
                        className={`w-full rounded-lg border p-4 text-left transition ${
                          offer.offer_id === selectedOfferId
                            ? 'border-blue-500 bg-sky-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{offer.name}</p>
                            <p className="text-sm text-slate-500">{offer.quantity} {offer.unit}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-slate-500">Price</p>
                            <p className="font-semibold text-slate-900">{offer.price} pts</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {selectedSellerId ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Game Account</p>
                    <p className="text-xs text-slate-500">Choose the account to assign to this order</p>
                  </div>
                  {accountsLoading ? (
                    <span className="text-sm text-slate-500">Loading accounts...</span>
                  ) : null}
                </div>

                {accountsError ? (
                  <p className="text-sm text-red-600">{accountsError}</p>
                ) : accountsLoading ? (
                  <p className="text-sm text-slate-500">Loading accounts...</p>
                ) : gameAccounts.length === 0 ? (
                  <p className="text-sm text-slate-500">No saved game accounts found. Add one in your profile before ordering.</p>
                ) : (
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="" disabled>
                      Select game account
                    </option>
                    {gameAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.game_name} — {account.account_identifier}
                      </option>
                    ))}
                  </select>
                )}

                <div className="mt-4 flex flex-col gap-3">
                  <Button
                    type="button"
                    onClick={handleCreateOrder}
                    disabled={
                      orderLoading ||
                      !selectedAccountId ||
                      !selectedOfferId ||
                      accountsLoading ||
                      gameAccounts.length === 0
                    }
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    {orderLoading ? 'Creating order...' : 'Create Order'}
                  </Button>

                  {orderError ? (
                    <p className="text-sm text-red-600">{orderError}</p>
                  ) : null}
                  {orderMessage ? (
                    <p className="text-sm text-green-600">{orderMessage}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <FieldGroup>
              <Field>
                <FieldLabel>Task Title</FieldLabel>
                <Input
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="Enter a short task title"
                  required
                />
              </Field>
            </FieldGroup>

            <FieldGroup>
              <Field>
                <FieldLabel>Task Description</FieldLabel>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Describe the service you need in detail"
                  rows={6}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </Field>
            </FieldGroup>

            <div className="grid grid-cols-2 gap-4">
              <FieldGroup>
                <Field>
                  <FieldLabel>Min Budget</FieldLabel>
                  <Input
                    name="budget_min"
                    type="number"
                    value={formData.budget_min}
                    onChange={handleChange}
                    placeholder="0"
                    required
                  />
                </Field>
              </FieldGroup>
              <FieldGroup>
                <Field>
                  <FieldLabel>Max Budget</FieldLabel>
                  <Input
                    name="budget_max"
                    type="number"
                    value={formData.budget_max}
                    onChange={handleChange}
                    placeholder="500"
                    required
                  />
                </Field>
              </FieldGroup>
            </div>

            <FieldGroup>
              <Field>
                <FieldLabel>Timeline</FieldLabel>
                <select
                  name="timeline"
                  value={formData.timeline}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select timeline</option>
                  <option value="1-day">1 day</option>
                  <option value="2-3-days">2-3 days</option>
                  <option value="1-week">1 week</option>
                  <option value="2-weeks">2 weeks</option>
                  <option value="flexible">Flexible</option>
                </select>
              </Field>
            </FieldGroup>

            {message && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {message}
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700">
                Save Task
              </Button>
              <Button type="button" variant="outline" className="flex-1">
                Save Draft
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
