// lib/session.ts
import crypto from 'crypto';

const b64u = {
  enc: (buf: Buffer | string) =>
    Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''),
  dec: (str: string) =>
    Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
};

export type CreatorSession = {
  wallet: string;
  handle: string;
  exp: number;        // ms epoch
  iat: number;        // ms epoch
  v: 1;               // version für spätere Erweiterungen
};

const COOKIE_NAME = 'ror_creator_sess';
export { COOKIE_NAME };

function getSecret(): string {
  const s = process.env.ROR_SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('Missing ROR_SESSION_SECRET');
  return s;
}

export function signSession(payload: CreatorSession): string {
  const secret = getSecret();
  const header = { alg: 'HS256', typ: 'ROR' };
  const h = b64u.enc(JSON.stringify(header));
  const p = b64u.enc(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  const s = b64u.enc(sig);
  return `${data}.${s}`;
}

export function verifySession(token: string): { ok: boolean; payload?: CreatorSession } {
  try {
    const secret = getSecret();
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return { ok: false };
    const data = `${h}.${p}`;
    const expect = crypto.createHmac('sha256', secret).update(data).digest();
    const sig = b64u.dec(s);
    if (expect.length !== sig.length || !crypto.timingSafeEqual(expect, sig)) return { ok: false };
    const payload = JSON.parse(b64u.dec(p).toString('utf8')) as CreatorSession;
    if (!payload || payload.v !== 1) return { ok: false };
    if (Date.now() > Number(payload.exp || 0)) return { ok: false };
    return { ok: true, payload };
  } catch {
    return { ok: false };
  }
}

export function setSessionCookie(res: any, token: string, maxAgeSec: number) {
  const cookie = [
    `${COOKIE_NAME}=${token}`,
    `Path=/`,                  // <-- WICHTIG: Cookie gilt auch für /api
    `Max-Age=${maxAgeSec}`,
    'HttpOnly',
    'SameSite=Lax',
    process.env.NODE_ENV === 'development' ? '' : 'Secure',
  ].filter(Boolean).join('; ');
  res.setHeader('Set-Cookie', cookie);
}

export function clearSessionCookie(res: any) {
  const cookie = [
    `${COOKIE_NAME}=;`,
    `Path=/`,                 // <-- Pfad muss zum Setzen passen
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
    process.env.NODE_ENV === 'development' ? '' : 'Secure',
  ].filter(Boolean).join('; ');
  res.setHeader('Set-Cookie', cookie);
}
