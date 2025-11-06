// lib/auth.ts
import { verifyDetachedSig, extractTs } from './verify';

export type AuthCheck = {
  ok: boolean;
  wallet?: string;
  error?: string;
};

/**
 * Client should send:
 *   x-wallet: <base58 pubkey>
 *   x-msg:    "ROR|auth|wallet=<pubkey>|ts=<ms>"
 *   x-sig:    <base58 signature of x-msg>
 */
export function checkRequestAuth(req: any): AuthCheck {
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

  const ok = verifyDetachedSig(msg, sig, wallet);
  if (!ok) return { ok: false, error: 'Invalid signature' };
  return { ok: true, wallet };
}
