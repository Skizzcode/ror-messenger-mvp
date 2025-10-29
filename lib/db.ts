// lib/db.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const KEY = 'ror:db:v1';

export type DB = {
  threads: Record<string, any>;
  messages: Record<string, any[]>;
  escrows: Record<string, any>;
  creators: Record<string, any>;
  checkouts: Record<string, any>;
};

const EMPTY_DB: DB = {
  threads: {},
  messages: {},
  escrows: {},
  creators: {},
  checkouts: {},
};

export async function readDB(): Promise<DB> {
  const data = await redis.get<DB>(KEY);
  return data || { ...EMPTY_DB };
}

export async function writeDB(db: DB): Promise<void> {
  await redis.set(KEY, db);
}

export function uid(): string {
  // @ts-ignore
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
