// lib/verify.ts
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import crypto from 'crypto';

export function sha256Base58Server(input: string): string {
  const hash = crypto.createHash('sha256').update(input, 'utf8').digest();
  return bs58.encode(hash);
}

export function verifyDetachedSig(msg: string, sigBase58: string, pubkeyBase58: string): boolean {
  try {
    const sig = bs58.decode(sigBase58);
    const pub = bs58.decode(pubkeyBase58);
    const msgBytes = new TextEncoder().encode(msg);
    return nacl.sign.detached.verify(msgBytes, sig, pub);
  } catch {
    return false;
  }
}

/** returns timestamp (ms) if ok, else null */
export function extractTs(msg: string): number | null {
  const m = msg.match(/\|ts=(\d+)\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}
