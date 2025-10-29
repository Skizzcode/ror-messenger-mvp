// lib/anchorClient.ts
import { AnchorProvider, Program, Idl } from '@coral-xyz/anchor';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey } from '@solana/web3.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import idlJson from './idl/ror_escrow.json';

export type AnyWallet = AnchorWallet | {
  publicKey: PublicKey;
  signTransaction: (tx: any) => Promise<any>;
  signAllTransactions: (txs: any[]) => Promise<any[]>;
};

export function getProgram(
  connection: Connection,
  wallet: AnyWallet,
  programId: string
) {
  const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
  const idl = idlJson as unknown as Idl;
  const address = new PublicKey(programId);

  // Anchor hat je nach Version unterschiedliche Overloads.
  // Wir erzwingen die korrekte Variante: (idl, address, provider)
  const ProgCtor = Program as unknown as new (idl: Idl, address: PublicKey, provider?: AnchorProvider) => Program<Idl>;
  return new ProgCtor(idl, address, provider);
}
