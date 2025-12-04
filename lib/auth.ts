// lib/auth.ts
import { verifyDetachedSig, extractTs } from './verify';
import { verifySession, COOKIE_NAME } from './session';

export type AuthCheck = {
  ok: boolean;
  wallet?: string;
  viaSessionHandle?: string | null;
  error?: string;
};

function getCookie(req: any, name: string): string | null {
  try {
    const raw = req?.headers?.cookie as string | undefined;
    if (!raw) return null;
    const parts = raw.split(';').map((c) => c.trim());
    const hit = parts.find((p) => p.startsWith(`${name}=`));
    if (!hit) return null;
    return hit.split('=').slice(1).join('=') || null;
  } catch {
    return null;
  }
}

/**
 * Client should send either:
 *   - a valid session cookie (set by /api/creator-session/start), OR
 *   - headers:
 *       x-wallet: <base58 pubkey>
 *       x-msg:    "ROR|auth|wallet=<pubkey>|ts=<ms>"
 *       x-sig:    <base58 signature of x-msg>
 */
export async function checkRequestAuth(req: any, opts?: { allowCookie?: boolean }): Promise<AuthCheck> {
  const allowCookie = opts?.allowCookie !== false;

  // 1) Try session cookie first (creator dashboard flow) if allowed
  if (allowCookie) {
    try {
      const token = getCookie(req, COOKIE_NAME);
      if (token) {
        const verified = verifySession(token);
        if (verified.ok && verified.payload?.wallet) {
          return {
            ok: true,
            wallet: verified.payload.wallet,
            viaSessionHandle: verified.payload.handle || null,
          };
        }
      }
    } catch {
      // fall through to header-based auth
    }
  }

  // 2) Fallback: header-signed auth (stateless)
  const wallet = String(req.headers['x-wallet'] || '');
  const msg = String(req.headers['x-msg'] || '');
  const sig = String(req.headers['x-sig'] || '');
  if (!wallet || !msg || !sig) return { ok: false, error: 'Missing auth headers' };

  const expectedPrefix = `ROR|auth|wallet=${wallet}|ts=`;
  if (!msg.startsWith(expectedPrefix)) return { ok: false, error: 'Invalid auth payload' };

  const ts = extractTs(msg);
  if (!ts || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
    return { ok: false, error: 'Expired/invalid timestamp' };
  }

  const ok = await verifyDetachedSig(msg, sig, wallet);
  if (!ok) return { ok: false, error: 'Invalid signature' };
  return { ok: true, wallet };
}
