// lib/token.ts
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

// 6-Decimals USDC auf Devnet/ Mainnet später via ENV setzen
export const USDC_DEVNET = new PublicKey('11111111111111111111111111111111'); // PLACEHOLDER

export function ataOf(owner: PublicKey, mint: PublicKey) {
  return getAssociatedTokenAddressSync(mint, owner, false);
}
