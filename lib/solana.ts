// lib/solana.ts
import { Connection, clusterApiUrl, type Commitment } from '@solana/web3.js';

const DEFAULT_COMMITMENT: Commitment =
  (process.env.SOLANA_COMMITMENT as Commitment) || 'confirmed';

/** Resolve RPC from env: server first, then client, else devnet */
export function getRpcEndpoint(): string {
  const server = process.env.SOLANA_RPC;
  const client = process.env.NEXT_PUBLIC_SOLANA_RPC;
  return server || client || clusterApiUrl('devnet');
}

// Browser singleton to avoid multiple websocket connections
let _browserConn: Connection | null = null;

/** Use in browser/client code */
export function getBrowserConnection(): Connection {
  if (!_browserConn) {
    _browserConn = new Connection(getRpcEndpoint(), DEFAULT_COMMITMENT);
  }
  return _browserConn;
}

/** Use in API routes / server functions (new per call is OK) */
export function getServerConnection(): Connection {
  return new Connection(getRpcEndpoint(), DEFAULT_COMMITMENT);
}
