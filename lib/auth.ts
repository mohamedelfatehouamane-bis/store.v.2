import * as bcrypt from 'bcryptjs';
import { jwtSign, jwtVerify } from './jwt';

export interface AuthPayload {
  id: string;
  email: string;
  username: string;
  role: 'customer' | 'seller' | 'admin';
  /** Seller profile ID (sellers.id). Present only when role === 'seller'. */
  seller_id?: string;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: AuthPayload): string {
  return jwtSign(payload, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: '7d',
  });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwtVerify(
      token,
      process.env.JWT_SECRET || 'your-secret-key'
    ) as AuthPayload;
  } catch {
    return null;
  }
}

/**
 * Resolve the correct public.users.id from the database using the email in
 * the JWT payload.  The JWT `id` field may carry a stale Supabase Auth UID
 * that differs from public.users.id for legacy accounts; looking up by email
 * guarantees we always get the real row ID used across all tables.
 */
export async function resolveUserId(auth: AuthPayload, db: any): Promise<string> {
  if (!auth.email) return auth.id;
  const { data: dbUser } = await (db as any)
    .from('users')
    .select('id')
    .eq('email', auth.email)
    .maybeSingle();
  return dbUser?.id ?? auth.id;
}

