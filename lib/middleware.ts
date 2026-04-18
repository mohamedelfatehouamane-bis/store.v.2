import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, AuthPayload } from './auth';

export function withAuth(handler: (req: NextRequest, auth: AuthPayload) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const authHeader = req.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing authorization token' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const auth = verifyToken(token);

    if (!auth) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    return handler(req, auth);
  };
}

export function withRole(
  roles: string[],
  handler: (req: NextRequest, auth: AuthPayload) => Promise<NextResponse>
) {
  return withAuth(async (req, auth) => {
    if (!roles.includes(auth.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    return handler(req, auth);
  });
}
