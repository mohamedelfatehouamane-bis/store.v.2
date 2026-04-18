'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SellerRating } from '@/components/seller-rating';
import { User, Briefcase, Award } from 'lucide-react';

type ProfileData = {
  full_name: string | null;
  bio: string | null;
  email: string;
  avatar_url: string | null;
  balance: number;
  total_points: number;
  is_verified: boolean;
  verification_status?: string;
  rejection_reason?: string | null;
  business_description?: string | null;
  average_rating?: number;
  total_reviews?: number;
  assigned_games?: string[];
  assigned_game_ids?: string[];
  telegram_id?: string | null;
  telegram_username?: string | null;
  telegram_link_token?: string | null;
  created_at: string;
};

type Review = {
  id: string;
  order_id: string;
  seller_id: string;
  customer: {
    username: string;
    avatar_url?: string | null;
  };
  rating: number;
  comment: string | null;
  created_at: string;
};

export default function ProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    bio: '',
    email: user?.email || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [availableGames, setAvailableGames] = useState<{ id: string; name: string }[]>([]);
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([]);
  const [businessDescription, setBusinessDescription] = useState('');
  const [applicationStep, setApplicationStep] = useState(1);
  const [applicationError, setApplicationError] = useState('');
  const [applicationMessage, setApplicationMessage] = useState('');
  const [applicationLoading, setApplicationLoading] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState('');
  const [telegramLinkToken, setTelegramLinkToken] = useState('');
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramDeepLink, setTelegramDeepLink] = useState('');
  const [telegramBotUrl, setTelegramBotUrl] = useState('');
  const [telegramSuccessMessage, setTelegramSuccessMessage] = useState('');

  const loadProfile = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setError('Authentication required');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/users/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error('Unable to load profile');
      }
      const data = await response.json();
      const userProfile = data.user;
      setProfile(userProfile);
      setFormData({
        full_name: userProfile.full_name ?? '',
        bio: userProfile.bio ?? '',
        email: userProfile.email,
      });
      setBusinessDescription(userProfile.business_description ?? '');
      setSelectedGameIds(userProfile.assigned_game_ids ?? []);
      setTelegramLinkToken(userProfile.telegram_link_token ?? '');

      const telegramStateRes = await fetch('/api/telegram/link-code', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (telegramStateRes.ok) {
        const telegramStateData = await telegramStateRes.json();
        setTelegramLinkToken(telegramStateData.telegram_link_token ?? '');
        setTelegramDeepLink(telegramStateData.deeplink ?? '');
        setTelegramBotUrl(telegramStateData.bot_url ?? '');
      }

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to fetch profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [user]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.location.hash !== '#connect-telegram') {
      return;
    }

    const scrollToTelegramCard = () => {
      const telegramElement = document.getElementById('connect-telegram');
      if (telegramElement) {
        telegramElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    // Delay slightly so the conditional card is mounted after profile/user state resolves.
    const timer = window.setTimeout(scrollToTelegramCard, 150);
    return () => window.clearTimeout(timer);
  }, [user?.role, profile?.telegram_id]);

  useEffect(() => {
    async function loadGames() {
      try {
        const response = await fetch('/api/games');
        const data = await response.json();
        setAvailableGames(data.games ?? []);
      } catch (err) {
        console.error('Unable to load available games', err);
      }
    }

    loadGames();
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'seller') {
      return
    }

    const sellerId = user.id

    const token = localStorage.getItem('auth_token')
    if (!token) {
      return
    }

    async function loadSellerReviews() {
      setReviewsLoading(true)
      setReviewsError('')

      try {
        const response = await fetch(`/api/reviews?seller_id=${sellerId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!response.ok) {
          throw new Error('Unable to load seller reviews')
        }

        const data = await response.json()
        setReviews(data.reviews ?? [])
      } catch (err) {
        console.error('Unable to fetch seller reviews', err)
        setReviewsError(err instanceof Error ? err.message : 'Failed to fetch seller reviews')
      } finally {
        setReviewsLoading(false)
      }
    }

    loadSellerReviews()
  }, [user])

  const renderStars = (rating: number) => {
    const filled = Math.round(rating)
    const empty = 5 - filled
    return '★'.repeat(filled) + '☆'.repeat(empty)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const sellerStatus = profile
    ? profile.verification_status || (profile.is_verified ? 'verified' : 'pending')
    : 'pending';
  const sellerIsApproved = sellerStatus === 'verified' || sellerStatus === 'approved';

  const toggleGameSelection = (gameId: string) => {
    setSelectedGameIds((current) =>
      current.includes(gameId)
        ? current.filter((id) => id !== gameId)
        : [...current, gameId]
    );
  };

  const handleApplicationSubmit = async () => {
    setApplicationError('');
    setApplicationMessage('');

    if (selectedGameIds.length === 0 || businessDescription.trim().length === 0) {
      setApplicationError('Please select at least one game and add a profile description.');
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setApplicationError('Authentication required');
      return;
    }

    setApplicationLoading(true);

    try {
      const response = await fetch('/api/sellers/application', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          business_name: profile?.full_name ?? null,
          business_description: businessDescription.trim(),
          game_ids: selectedGameIds,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to submit seller application');
      }

      setApplicationMessage(data.message || 'Seller application submitted for review.');
      await loadProfile();
      setApplicationStep(3);
    } catch (err) {
      console.error(err);
      setApplicationError(err instanceof Error ? err.message : 'Failed to submit application');
    } finally {
      setApplicationLoading(false);
    }
  };

  const handleRequestTopup = () => {
    router.push('/dashboard/topup');
  };

  const handleSave = () => {
    setIsEditing(false);
  };

  const handleGenerateTelegramLink = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setError('Authentication required');
      return;
    }

    setTelegramLoading(true);
    setTelegramSuccessMessage('');
    try {
      const response = await fetch('/api/telegram/link-code', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to generate Telegram link');
      }

      setTelegramLinkToken(data.telegram_link_token ?? '');
      setTelegramDeepLink(data.deeplink ?? '');
      setTelegramBotUrl(data.bot_url ?? '');
      setTelegramSuccessMessage(
        data?.message || 'Link generated. Open Telegram Bot to complete account linking.'
      );
      await loadProfile();
    } catch (err) {
      console.error('Generate Telegram code error', err);
      setError(err instanceof Error ? err.message : 'Failed to generate Telegram link');
    } finally {
      setTelegramLoading(false);
    }
  };

  const telegramOpenUrl = telegramDeepLink || telegramBotUrl;

  return (
    <div className="flex-1 p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Profile</h1>
        <p className="text-slate-600 mt-2">Manage your account and preferences.</p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {user?.role === 'seller' && profile ? (
        sellerIsApproved ? (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            ✅ You are verified and can accept orders.
          </div>
        ) : sellerStatus === 'rejected' ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            ❌ Your seller application was rejected.
            {profile.rejection_reason ? ` Reason: ${profile.rejection_reason}` : ''}
          </div>
        ) : (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            ⏳ Your account is under review. You cannot accept orders yet.
          </div>
        )
      ) : null}

      {user?.role === 'seller' && profile && !sellerIsApproved && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Seller Onboarding</CardTitle>
            <CardDescription>Complete your seller profile and request a review.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6 grid grid-cols-3 gap-3 text-center text-xs font-medium uppercase text-slate-500">
              <div className={`rounded-lg border px-3 py-2 ${applicationStep >= 1 ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white'}`}>
                1. Select games
              </div>
              <div className={`rounded-lg border px-3 py-2 ${applicationStep >= 2 ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white'}`}>
                2. Add description
              </div>
              <div className={`rounded-lg border px-3 py-2 ${applicationStep >= 3 ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white'}`}>
                3. Submit review
              </div>
            </div>

            <div className="space-y-6">
              {applicationError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {applicationError}
                </div>
              )}
              {applicationMessage && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  {applicationMessage}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-semibold text-slate-900">Step {applicationStep}: {applicationStep === 1 ? 'Pick your games' : applicationStep === 2 ? 'Describe your seller profile' : 'Review and submit'}</p>
                    <div className="text-xs text-slate-500">{selectedGameIds.length} games selected</div>
                  </div>

                  {applicationStep === 1 && (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-600">Choose at least one game you can support.</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {availableGames.map((game) => (
                          <label key={game.id} className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              className="mr-3 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              checked={selectedGameIds.includes(game.id)}
                              onChange={() => toggleGameSelection(game.id)}
                            />
                            {game.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {applicationStep === 2 && (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-600">Add a short profile description that explains your experience and services.</p>
                      <textarea
                        value={businessDescription}
                        onChange={(e) => setBusinessDescription(e.target.value)}
                        rows={5}
                        className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="Describe your game services, specialties, and experience"
                      />
                    </div>
                  )}

                  {applicationStep === 3 && (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm text-slate-600">Selected games</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedGameIds.length > 0 ? (
                            availableGames
                              .filter((game) => selectedGameIds.includes(game.id))
                              .map((game) => (
                                <span key={game.id} className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                                  {game.name}
                                </span>
                              ))
                          ) : (
                            <span className="text-sm text-slate-500">No games selected yet.</span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm text-slate-600">Seller description</p>
                        <p className="mt-2 text-sm text-slate-900 whitespace-pre-line">
                          {businessDescription || 'No description provided yet.'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                        {sellerStatus === 'rejected'
                          ? 'Your previous application was rejected. Fix the required items and request review again.'
                          : 'Complete all steps and submit your seller profile for admin review.'}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    variant="outline"
                    disabled={applicationStep === 1}
                    onClick={() => setApplicationStep((step) => Math.max(1, step - 1))}
                    className="w-full sm:w-auto"
                  >
                    Back
                  </Button>
                  <Button
                    disabled={applicationStep === 3}
                    onClick={() => setApplicationStep((step) => Math.min(3, step + 1))}
                    className="w-full sm:w-auto"
                  >
                    Next
                  </Button>
                  <Button
                    onClick={handleApplicationSubmit}
                    disabled={applicationLoading || selectedGameIds.length === 0 || businessDescription.trim().length === 0}
                    className="w-full sm:w-auto"
                  >
                    {applicationLoading
                      ? 'Submitting...'
                      : sellerStatus === 'rejected'
                      ? 'Request Review Again'
                      : 'Submit for Approval'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-4xl mx-auto mb-4">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">{user?.username}</h2>
              <p className="text-sm text-slate-600 mb-4 capitalize">{user?.role}</p>
              <Button
                variant={isEditing ? 'default' : 'outline'}
                onClick={() => setIsEditing(!isEditing)}
                className="w-full"
              >
                {isEditing ? 'Editing...' : 'Edit Profile'}
              </Button>
            </CardContent>
          </Card>

          {user?.role === 'customer' && (
            <>
              <Card className="mt-6">
              <CardHeader>
                <CardTitle>Request Points Top-up</CardTitle>
                <CardDescription>Submit a new top-up request for admin approval.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Use this action to request additional points when your balance runs low.
                  </p>
                  <Button
                    onClick={handleRequestTopup}
                    className="w-full"
                  >
                    Open Top-up Center
                  </Button>
                </div>
              </CardContent>
            </Card>

            </>          )}

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-slate-600">Member Since</p>
                <p className="font-bold text-slate-900">
                  {profile ? new Date(profile.created_at).toLocaleDateString() : 'Loading...'}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Current Balance</p>
                <p className="font-bold text-slate-900">{profile?.balance ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Total Points</p>
                <p className="font-bold text-slate-900">{profile?.total_points ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Account Status</p>
                <p className="font-bold text-green-600">
                  {profile ? (profile.is_verified ? 'Verified' : 'Unverified') : 'Loading...'}
                </p>
              </div>
              {user?.role === 'seller' && (
                <div>
                  <p className="text-sm text-slate-600">Seller Rating</p>
                  <div className="mt-1">
                    <SellerRating avgRating={profile?.average_rating} totalReviews={profile?.total_reviews} size="md" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {user?.role === 'seller' && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Seller Reviews</CardTitle>
                <CardDescription>Recent ratings from your customers</CardDescription>
              </CardHeader>
              <CardContent>
                {reviewsLoading ? (
                  <div className="py-8 text-center text-slate-500">Loading reviews…</div>
                ) : reviewsError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {reviewsError}
                  </div>
                ) : reviews.length > 0 ? (
                  <div className="space-y-4">
                    {reviews.map((review) => (
                      <div key={review.id} className="rounded-lg border border-slate-200 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-900">{review.customer.username}</p>
                            <p className="text-xs text-slate-500">{new Date(review.created_at).toLocaleDateString()}</p>
                          </div>
                          <span className="text-yellow-500 text-lg">{renderStars(review.rating)}</span>
                        </div>
                        {review.comment && <p className="mt-3 text-sm text-slate-700">{review.comment}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-500">No reviews yet.</div>
                )}
              </CardContent>
            </Card>
          )}

          {(user?.role === 'seller' || user?.role === 'customer') && (
            <Card id="connect-telegram" className="mt-6 scroll-mt-24">
              <CardHeader>
                <CardTitle>Connect Telegram</CardTitle>
                <CardDescription>
                  {user?.role === 'seller'
                    ? 'Get instant order updates and accept/reject directly from Telegram.'
                    : 'Connect Telegram to receive account and order updates.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {telegramSuccessMessage ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                    ✅ {telegramSuccessMessage}
                  </div>
                ) : null}

                {profile?.telegram_id ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                    ✅ Telegram Connected{profile.telegram_username ? ` (@${profile.telegram_username})` : ''}
                  </div>
                ) : (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                    Link your Telegram to receive updates
                  </div>
                )}

                <Button onClick={handleGenerateTelegramLink} disabled={telegramLoading} className="w-full">
                  {telegramLoading ? 'Generating...' : 'Connect Telegram'}
                </Button>

                {telegramOpenUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => window.open(telegramOpenUrl, '_blank', 'noopener,noreferrer')}
                  >
                    Open Telegram Bot
                  </Button>
                ) : null}

                {telegramLinkToken ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Send this to the bot:</p>
                    <p className="mt-2 rounded bg-slate-900 px-2 py-1 font-mono text-slate-100">/start {telegramLinkToken}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}

        </div>

        <div className="lg:col-span-2 space-y-6">
          {isEditing && (
            <Card>
              <CardHeader>
                <CardTitle>Edit Profile</CardTitle>
                <CardDescription>Update your profile information</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4">
                  <FieldGroup>
                    <Field>
                      <FieldLabel>Full Name</FieldLabel>
                      <Input name="full_name" value={formData.full_name} onChange={handleChange} />
                    </Field>
                  </FieldGroup>

                  <FieldGroup>
                    <Field>
                      <FieldLabel>Email</FieldLabel>
                      <Input name="email" type="email" value={formData.email} onChange={handleChange} />
                    </Field>
                  </FieldGroup>

                  <FieldGroup>
                    <Field>
                      <FieldLabel>Bio</FieldLabel>
                      <textarea
                        name="bio"
                        value={formData.bio}
                        onChange={handleChange}
                        className="w-full min-h-24 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </Field>
                  </FieldGroup>

                  <div className="flex gap-2">
                    <Button onClick={handleSave} className="flex-1">
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsEditing(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <Tabs defaultValue="account" className="w-full">
              <TabsList className="grid w-full grid-cols-3 border-b border-slate-200">
                <TabsTrigger value="account" className="flex items-center gap-2">
                  <User size={18} />
                  Account
                </TabsTrigger>
                {user?.role === 'seller' && (
                  <TabsTrigger value="business" className="flex items-center gap-2">
                    <Briefcase size={18} />
                    Business
                  </TabsTrigger>
                )}
                <TabsTrigger value="security" className="flex items-center gap-2">
                  <Award size={18} />
                  Security
                </TabsTrigger>
              </TabsList>

              <TabsContent value="account">
                <CardContent className="p-6 space-y-4">
                  <div>
                    <p className="text-sm text-slate-600 font-semibold">Email Address</p>
                    <p className="text-slate-900">{profile?.email ?? user?.email}</p>
                  </div>
                  <div className="border-t border-slate-200 pt-4">
                    <p className="text-sm text-slate-600 font-semibold">Account Type</p>
                    <p className="text-slate-900 capitalize">{user?.role}</p>
                  </div>
                  <div className="border-t border-slate-200 pt-4">
                    <Button variant="outline" className="text-red-600 hover:text-red-700">
                      Change Password
                    </Button>
                  </div>
                </CardContent>
              </TabsContent>

              {user?.role === 'seller' && (
                <TabsContent value="business">
                  <CardContent className="p-6 space-y-4">
                    <div>
                      <p className="text-sm text-slate-600 font-semibold mb-2">Business Name</p>
                      <Input placeholder="Enter your business name" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-600 font-semibold mb-2">Business Description</p>
                      <textarea
                        className="w-full min-h-24 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Tell customers about your services"
                      />
                    </div>
                    <Button className="w-full">Update Business Info</Button>
                  </CardContent>
                </TabsContent>
              )}

              <TabsContent value="security">
                <CardContent className="p-6 space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900 font-semibold">Two-Factor Authentication</p>
                    <p className="text-sm text-blue-800 mt-1">Not enabled</p>
                    <Button variant="outline" className="mt-3">
                      Enable 2FA
                    </Button>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-green-900 font-semibold">Active Sessions</p>
                    <p className="text-sm text-green-800 mt-1">1 session active</p>
                    <Button variant="outline" className="mt-3" size="sm">
                      Sign Out All
                    </Button>
                  </div>
                </CardContent>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}
