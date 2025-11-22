// lib/verify.ts
//
// Centralized signature verification for all ROR flows.
// Used by:
// - lib/auth.ts (verifyDetachedSig, extractTs)
// - /api/creator-authz
// - /api/creator-session/start
// - /api/message
// - /api/create-thread
//
// We verify Ed25519 signatures (Solana wallets) using tweetnacl + bs58.

import nacl from 'tweetnacl';
import bs58 from 'bs58';

export type VerifyParams = {
  msg: string;
  sigBase58: string;
  pubkeyBase58: string;
};

/**
 * Extract numeric timestamp from a message string like:
 * "ROR|auth|wallet=...|ts=1700000000000"
 * "ROR|create-thread|...|ts=1700000000000"
 * "ROR|message|...|ts=1700000000000"
 */
export function extractTs(msg: string): number | null {
  if (!msg) return null;
  const parts = String(msg).split('|');
  const tsPart = parts.find((p) => p.startsWith('ts='));
  if (!tsPart) return null;

  const raw = tsPart.split('ts=').pop();
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return null;
  return ts;
}

/**
 * Core Ed25519 signature verification.
 * - msg must be EXACTLY the string that wallet.signMessage() signed.
 * - sigBase58 is the base58-encoded signature.
 * - pubkeyBase58 is the base58-encoded public key (Solana address).
 */
export async function verifySignature({
  msg,
  sigBase58,
  pubkeyBase58,
}: VerifyParams): Promise<boolean> {
  try {
    if (!msg || !sigBase58 || !pubkeyBase58) return false;

    const messageBytes = new TextEncoder().encode(msg);
    const signature = bs58.decode(sigBase58);
    const publicKey = bs58.decode(String(pubkeyBase58 || '').trim());

    if (
      !(signature instanceof Uint8Array) ||
      !(publicKey instanceof Uint8Array)
    ) {
      return false;
    }

    return nacl.sign.detached.verify(messageBytes, signature, publicKey);
  } catch (e) {
    console.error('verifySignature error', e);
    return false;
  }
}

/**
 * Generic alias – einige Stellen rufen einfach verify(...) auf.
 */
export async function verify(params: VerifyParams): Promise<boolean> {
  return verifySignature(params);
}

/**
 * Alias für "server-side" Verification – wird z.B. in creator-authz/start genutzt.
 */
export async function verifyServerSignature(
  params: VerifyParams,
): Promise<boolean> {
  return verifySignature(params);
}

/**
 * Speziell von lib/auth.ts importiert:
 *   import { verifyDetachedSig, extractTs } from './verify';
 *
 * Dort wird sie mit 3 Argumenten aufgerufen:
 *   verifyDetachedSig(msg, sig, wallet)
 *
 * Also hier eine 3-Argumente-Signatur anbieten und intern auf verifySignature mappen.
 */
export async function verifyDetachedSig(
  msg: string,
  sigBase58: string,
  pubkeyBase58: string,
): Promise<boolean> {
  return verifySignature({ msg, sigBase58, pubkeyBase58 });
}

// Default export für `import * as Verify from './verify'` Patterns.
const api = {
  verifySignature,
  verify,
  verifyServerSignature,
  verifyDetachedSig,
  extractTs,
};

export default api;
