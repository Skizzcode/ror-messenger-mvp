// lib/solana.ts
import { Connection, PublicKey } from '@solana/web3.js';

// Für Tests: DEVNET. (Später: mainnet-beta)
export const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=111ff3bd-77a4-42c8-b97e-9b70cc1a2939';
export const connection = new Connection(RPC_URL, 'confirmed');

// Platzhalter – für MVP egal. (Devnet-"USDC" variiert; wir mocken vorerst.)
export const USDC_MINT = new PublicKey('11111111111111111111111111111111');

// Platzhalter-ProgramID – sobald Anchor-Programm deployed ist, hier ersetzen.
export const ESCROW_PROGRAM_ID = new PublicKey('EscroW1111111111111111111111111111111');
