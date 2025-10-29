// lib/escrowClient.ts
import { PublicKey } from '@solana/web3.js';
import { getBrowserConnection } from './solana';
import { ataOf, USDC_DEVNET } from './token';

// NOTE: We keep PROGRAM_ID / PLATFORM_WALLET as placeholders for later on-chain work.
// Replace once the Anchor program is deployed.
const PROGRAM_ID = 'RoREscrow1111111111111111111111111111111111'; // <— REPLACE later
export const PLATFORM_WALLET = new PublicKey('11111111111111111111111111111111'); // <— REPLACE later

// ---- Types ----
export type AnyWallet = {
  publicKey: PublicKey | null;
  signTransaction?: (tx: any) => Promise<any>;
  signAllTransactions?: (txs: any[]) => Promise<any[]>;
};

// ---- PDA helpers (kept for future real TXs) ----
export function threadStatePda(
  fan: PublicKey,
  creator: PublicKey,
  mint: PublicKey,
  programId: PublicKey
) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('thread'), fan.toBuffer(), creator.toBuffer(), mint.toBuffer()],
    programId
  );
  return pda;
}

export function vaultPdaFor(
  threadState: PublicKey,
  mint: PublicKey,
  programId: PublicKey
) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), threadState.toBuffer(), mint.toBuffer()],
    programId
  );
  return pda;
}

// ---- Mock TX helper (v1, no chain yet) ----
function mockTx(label: string) {
  return `${label}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

// ---- API (MOCK for now; touches RPC to validate endpoint) ----

/** Fan locks amount into escrow (MOCK). Later: build and send init instruction via Anchor/JS. */
export async function clientInitEscrow(opts: {
  threadId: string;
  amountUSDC: number;
  payer: PublicKey;
  wallet: AnyWallet;
  creator?: PublicKey;
  deadlineSec?: number;
}) {
  // Touch RPC to ensure endpoint is OK
  const conn = getBrowserConnection();
  await conn.getLatestBlockhash('confirmed');

  // Example usage (future): ATAs for payer in USDC
  const fanAta = ataOf(opts.payer, USDC_DEVNET);
  void fanAta;

  // Later (real): getProgram(conn, opts.wallet, PROGRAM_ID) + send instruction(s)
  const tx = mockTx('init');
  return { tx, status: 'locked' as const };
}

/** Creator replied ⇒ release escrow to creator (MOCK). */
export async function clientReleaseOnReply(opts: {
  fan: PublicKey;
  creator: PublicKey;
  wallet: AnyWallet;
}) {
  const conn = getBrowserConnection();
  await conn.getLatestBlockhash('confirmed');

  const creatorAta = ataOf(opts.creator, USDC_DEVNET);
  void creatorAta;

  const tx = mockTx('release');
  return { tx, status: 'released' as const };
}

/** Deadline passed ⇒ refund to fan (MOCK). */
export async function clientRefund(opts: {
  fan: PublicKey;
  creator: PublicKey;
  wallet: AnyWallet;
}) {
  const conn = getBrowserConnection();
  await conn.getLatestBlockhash('confirmed');

  const fanAta = ataOf(opts.fan, USDC_DEVNET);
  void fanAta;

  const tx = mockTx('refund');
  return { tx, status: 'refunded' as const };
}
