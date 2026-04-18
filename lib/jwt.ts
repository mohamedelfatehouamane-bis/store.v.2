import crypto from 'crypto';

interface JWTPayload {
  [key: string]: any;
  iat?: number;
  exp?: number;
}

interface JWTOptions {
  expiresIn?: string | number;
}

function parseExpiry(expiresIn: string | number): number {
  if (typeof expiresIn === 'number') {
    return Math.floor(Date.now() / 1000) + expiresIn;
  }
  
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error('Invalid expiry format');
  }

  const [, value, unit] = match;
  const num = parseInt(value, 10);
  const multipliers: { [key: string]: number } = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  return Math.floor(Date.now() / 1000) + num * (multipliers[unit] || 1);
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64UrlDecode(str: string): string {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(
    padded.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  ).toString();
}

export function jwtSign(
  payload: JWTPayload,
  secret: string,
  options: JWTOptions = {}
): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ...payload,
    iat: now,
    ...(options.expiresIn && { exp: parseExpiry(options.expiresIn) }),
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(claims));
  const message = `${headerEncoded}.${payloadEncoded}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${message}.${signature}`;
}

export function jwtVerify(token: string, secret: string): JWTPayload {
  const parts = token.split('.');
  
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  const [headerEncoded, payloadEncoded, signatureEncoded] = parts;

  // Verify signature
  const message = `${headerEncoded}.${payloadEncoded}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  if (signatureEncoded !== expectedSignature) {
    throw new Error('Invalid token signature');
  }

  // Decode and verify payload
  const payload = JSON.parse(base64UrlDecode(payloadEncoded));

  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error('Token has expired');
  }

  return payload;
}
