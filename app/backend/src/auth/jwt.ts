import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_EXPIRY = '7d';

export interface JWTPayload {
  npub: string;
  iat?: number;
  exp?: number;
}

export function signJWT(npub: string): string {
  return jwt.sign({ npub }, JWT_SECRET!, { expiresIn: JWT_EXPIRY });
}

export function verifyJWT(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET!);
    if (typeof decoded === 'object' && decoded !== null && 'npub' in decoded) {
      return decoded as JWTPayload;
    }
    return null;
  } catch (error) {
    return null;
  }
}
