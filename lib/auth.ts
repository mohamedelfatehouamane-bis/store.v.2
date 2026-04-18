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

