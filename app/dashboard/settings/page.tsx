'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Loader2, Lock, Save, Send, User } from 'lucide-react';

type ProfileResponse = {
  username: string;
  email: string;
};

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setError('Authentication required');
      setLoading(false);
      return;
    }

    async function loadProfile() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch('/api/users/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Unable to load settings');
        }

        const nextProfile = {
          username: data.user?.username ?? '',
          email: data.user?.email ?? '',
        };

        setProfile(nextProfile);
        setFormData((current) => ({
          ...current,
          username: nextProfile.username,
          email: nextProfile.email,
        }));
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token || !user) {
      setError('Authentication required');
      return;
    }

    setError('');
    setSuccess('');

    const username = formData.username.trim();
    const wantsPasswordChange =
      formData.current_password.length > 0 ||
      formData.new_password.length > 0 ||
      formData.confirm_password.length > 0;

    if (!username) {
      setError('Username is required');
      return;
    }

    if (wantsPasswordChange) {
      if (!formData.current_password || !formData.new_password || !formData.confirm_password) {
        setError('Fill in all password fields to change your password');
        return;
      }

      if (formData.new_password !== formData.confirm_password) {
        setError('New password and confirm password must match');
        return;
      }
    }

    setSaving(true);

    try {
      const response = await fetch('/api/users/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username,
          current_password: wantsPasswordChange ? formData.current_password : undefined,
          new_password: wantsPasswordChange ? formData.new_password : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to update settings');
      }

      const updatedUser = {
        id: data.user.id,
        email: data.user.email,
        username: data.user.username,
        role: data.user.role,
      };

      updateUser(updatedUser);
      setProfile({
        username: updatedUser.username,
        email: updatedUser.email,
      });
      setFormData((current) => ({
        ...current,
        username: updatedUser.username,
        email: updatedUser.email,
        current_password: '',
        new_password: '',
        confirm_password: '',
      }));
      setSuccess(data.message || 'Settings updated successfully');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-white px-3 py-4 text-black dark:bg-[#020617] dark:text-white sm:px-6 sm:py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-black dark:text-white sm:text-3xl">Settings</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 sm:text-base">Manage your account details and security.</p>
        </div>

        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-[#020617]">
            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-300">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading settings...</span>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                {success}
              </div>
            )}

            <Card className="rounded-xl border border-gray-200 bg-gray-50 text-black dark:border-gray-800 dark:bg-[#020617] dark:text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-black dark:text-white">
                  <User className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  Profile
                </CardTitle>
                <CardDescription className="text-gray-500 dark:text-gray-400">
                  Update your public account details.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel className="text-gray-700 dark:text-gray-300">Username</FieldLabel>
                    <Input
                      name="username"
                      value={formData.username}
                      onChange={handleInputChange}
                      className="border-gray-300 bg-white text-black dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      placeholder="Enter your username"
                    />
                  </Field>
                </FieldGroup>

                <FieldGroup>
                  <Field>
                    <FieldLabel className="text-gray-700 dark:text-gray-300">Email</FieldLabel>
                    <Input
                      name="email"
                      value={formData.email}
                      disabled
                      className="border-gray-300 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>

            <Card className="rounded-xl border border-gray-200 bg-gray-50 text-black dark:border-gray-800 dark:bg-[#020617] dark:text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-black dark:text-white">
                  <Lock className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  Change Password
                </CardTitle>
                <CardDescription className="text-gray-500 dark:text-gray-400">
                  Leave these fields empty if you do not want to change your password.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel className="text-gray-700 dark:text-gray-300">Current Password</FieldLabel>
                    <Input
                      type="password"
                      name="current_password"
                      value={formData.current_password}
                      onChange={handleInputChange}
                      className="border-gray-300 bg-white text-black dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      placeholder="Enter your current password"
                    />
                  </Field>
                </FieldGroup>

                <FieldGroup>
                  <Field>
                    <FieldLabel className="text-gray-700 dark:text-gray-300">New Password</FieldLabel>
                    <Input
                      type="password"
                      name="new_password"
                      value={formData.new_password}
                      onChange={handleInputChange}
                      className="border-gray-300 bg-white text-black dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      placeholder="Enter a new password"
                    />
                  </Field>
                </FieldGroup>

                <FieldGroup>
                  <Field>
                    <FieldLabel className="text-gray-700 dark:text-gray-300">Confirm Password</FieldLabel>
                    <Input
                      type="password"
                      name="confirm_password"
                      value={formData.confirm_password}
                      onChange={handleInputChange}
                      className="border-gray-300 bg-white text-black dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      placeholder="Re-enter your new password"
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>

            <Card className="rounded-xl border border-gray-200 bg-gray-50 text-black dark:border-gray-800 dark:bg-[#020617] dark:text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-black dark:text-white">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-white">
                    <Send className="h-3.5 w-3.5" />
                  </span>
                  Telegram
                </CardTitle>
                <CardDescription className="text-gray-500 dark:text-gray-400">
                  Connect your Telegram to receive account updates and controls.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => router.push('/dashboard/profile#connect-telegram')}
                >
                  <Send className="h-4 w-4 text-sky-500" />
                  Connect Telegram
                </Button>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={saving || loading || !profile}
                className="gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
