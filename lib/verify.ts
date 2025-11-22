// lib/verify.ts
//
// Server-side signature verification for all ROR messages
// (auth, create-thread, message, bind-fan, etc.)

import nacl from 'tweetnacl';
import bs58 from 'bs58';

export type VerifyParams = {
  msg: string;
  sigBase58: string;
  pubkeyBase58: string;
};

/**
 * Core Ed25519 verification using tweetnacl.
 * - msg: the exact string that was signed on the client
 * - sigBase58: base58-encoded signature from wallet.signMessage()
 * - pubkeyBase58: base58-encoded public key (wallet address)
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
    const publicKey = bs58.decode(pubkeyBase64Safe(pubkeyBase58));

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
 * Optional: wrapper, same semantics, used by some older code paths.
 */
export async function verify(params: VerifyParams): Promise<boolean> {
  return verifySignature(params);
}

/**
 * Optional alias for "server-side verify" used in some places.
 */
export async function verifyServerSignature(
  params: VerifyParams,
): Promise<boolean> {
  return verifySignature(params);
}

/**
 * Helper to normalize possible accidental spaces etc. in publicKey strings.
 */
function pubkeyBase64Safe(input: string): string {
  return String(input || '').trim();
}

// Default export for "import * as Verify" compatibility:
export default {
  verifySignature,
  verifyServerSignature,
  verify,
};
