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

function normalizeDB(raw: any): DB {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_DB };
  }

  return {
    threads: raw.threads && typeof raw.threads === 'object' ? raw.threads : {},
    messages: raw.messages && typeof raw.messages === 'object' ? raw.messages : {},
    escrows: raw.escrows && typeof raw.escrows === 'object' ? raw.escrows : {},
    creators: raw.creators && typeof raw.creators === 'object' ? raw.creators : {},
    checkouts: raw.checkouts && typeof raw.checkouts === 'object' ? raw.checkouts : {},
  };
}

export async function readDB(): Promise<DB> {
  try {
    const data = await redis.get<DB>(KEY);
    return normalizeDB(data);
  } catch (e) {
    // Falls Redis nicht erreichbar ist oder irgendwas schiefgeht:
    console.error('readDB error', e);
    return { ...EMPTY_DB };
  }
}

export async function writeDB(db: DB): Promise<void> {
  const normalized = normalizeDB(db);
  await redis.set(KEY, normalized);
}

export function uid(): string {
  // @ts-ignore
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
