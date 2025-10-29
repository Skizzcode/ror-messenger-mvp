// lib/sign.ts
import bs58 from 'bs58';

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  // Create a fresh ArrayBuffer (never SharedArrayBuffer) and copy bytes
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

async function sha256Base58Browser(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(data));
  return bs58.encode(new Uint8Array(digest));
}

export async function signCreateThread(
  wallet: { publicKey: { toBase58(): string }; signMessage?: (m: Uint8Array) => Promise<Uint8Array> },
  params: { creator: string; fanPubkey: string; firstMessage: string; ttlHours: number }
) {
  if (!wallet?.signMessage) throw new Error('Wallet does not support signMessage');
  const ts = Date.now();
  const bodyhash = await sha256Base58Browser(params.firstMessage);
  const msg =
    `ROR|create-thread|creator=${params.creator}|fan=${params.fanPubkey}|` +
    `bodyhash=${bodyhash}|ttl=${params.ttlHours}|ts=${ts}`;
  const sig = await wallet.signMessage(new TextEncoder().encode(msg));
  return { msg, sigBase58: bs58.encode(sig), pubkeyBase58: wallet.publicKey.toBase58() };
}

export async function signMessagePayload(
  wallet: { publicKey: { toBase58(): string }; signMessage?: (m: Uint8Array) => Promise<Uint8Array> },
  params: { threadId: string; from: 'fan' | 'creator'; body: string }
) {
  if (!wallet?.signMessage) throw new Error('Wallet does not support signMessage');
  const ts = Date.now();
  const bodyhash = await sha256Base58Browser(params.body);
  const msg =
    `ROR|message|thread=${params.threadId}|from=${params.from}|` +
    `bodyhash=${bodyhash}|ts=${ts}`;
  const sig = await wallet.signMessage(new TextEncoder().encode(msg));
  return { msg, sigBase58: bs58.encode(sig), pubkeyBase58: wallet.publicKey.toBase58() };
}

/** Sign payload to bind a Stripe-started thread to the currently connected wallet */
export async function signBindFan(
  wallet: { publicKey: { toBase58(): string }; signMessage?: (m: Uint8Array) => Promise<Uint8Array> },
  params: { threadId: string }
) {
  if (!wallet?.signMessage) throw new Error('Wallet does not support signMessage');
  const fan = wallet.publicKey.toBase58();
  const ts = Date.now();
  const msg = `ROR|bind-fan|thread=${params.threadId}|fan=${fan}|ts=${ts}`;
  const sig = await wallet.signMessage(new TextEncoder().encode(msg));
  return { msg, sigBase58: bs58.encode(sig), pubkeyBase58: fan };
}
