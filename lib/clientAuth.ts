// lib/clientAuth.ts
export async function getAuthHeadersOnce(wallet: any) {
  // cache per tab in-memory
  if (!(globalThis as any).__ROR_AUTH) (globalThis as any).__ROR_AUTH = {};
  const cache = (globalThis as any).__ROR_AUTH;

  const pk = wallet?.publicKey?.toBase58?.();
  if (!pk) return null;
  if (cache[pk]) return cache[pk];

  if (!wallet?.signMessage) {
    throw new Error('Your wallet must support message signing.');
  }
  const msg = `ROR|auth|wallet=${pk}|ts=${Date.now()}`;
  const enc = new TextEncoder().encode(msg);
  const sig = await wallet.signMessage(enc);
  const { default: bs58 } = await import('bs58');

  const headers = {
    'x-wallet': pk,
    'x-msg': msg,
    'x-sig': bs58.encode(sig),
  };
  cache[pk] = headers; // store for this tab lifetime
  return headers;
}
