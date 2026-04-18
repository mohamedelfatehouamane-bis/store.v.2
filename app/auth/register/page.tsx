'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'customer' | 'seller'>('customer');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      await register(email, username, password, role);
      if (role === 'seller') {
        setSuccessMessage('Registration successful! Your seller profile is pending admin verification.');
        setTimeout(() => router.push('/dashboard'), 2000);
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Join MOHSTORE</CardTitle>
          <CardDescription>Create your account and start gaming</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FieldGroup>
              <Field>
                <FieldLabel>Email</FieldLabel>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  disabled={isLoading}
                />
              </Field>
            </FieldGroup>

            <FieldGroup>
              <Field>
                <FieldLabel>Username</FieldLabel>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose a username"
                  required
                  disabled={isLoading}
                />
              </Field>
            </FieldGroup>

            <FieldGroup>
              <Field>
                <FieldLabel>Password</FieldLabel>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  disabled={isLoading}
                />
              </Field>
            </FieldGroup>

            <FieldGroup>
              <Field>
                <FieldLabel>Confirm Password</FieldLabel>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  required
                  disabled={isLoading}
                />
              </Field>
            </FieldGroup>

            <FieldGroup>
              <FieldLabel>Account Type</FieldLabel>
              <RadioGroup value={role} onValueChange={(value) => setRole(value as 'customer' | 'seller')}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="customer" id="customer" />
                  <label htmlFor="customer" className="text-sm cursor-pointer">
                    Customer (Find game services)
                  </label>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="seller" id="seller" />
                    <label htmlFor="seller" className="text-sm cursor-pointer">
                      Seller (Offer game services)
                    </label>
                  </div>
                  {role === 'seller' && (
                    <p className="text-xs text-slate-500 ml-6">
                      ℹ️ Your seller profile will need admin verification before you can accept orders.
                    </p>
                  )}
                </div>
              </RadioGroup>
            </FieldGroup>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-3 py-2 rounded text-sm">
                {successMessage}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <p className="text-center text-sm text-slate-600 mt-4">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
