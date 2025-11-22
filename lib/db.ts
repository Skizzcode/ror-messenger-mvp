// lib/db.ts
import { Redis } from '@upstash/redis';

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

const KEY = 'ror:db:v1';

// ✅ Use Redis only if URL + TOKEN are present
const HAS_REDIS =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = HAS_REDIS
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// In-memory fallback (for local dev / missing env)
let memoryDB: DB = { ...EMPTY_DB };

function normalizeDB(raw: any): DB {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_DB };
  }

  return {
    threads:
      raw.threads && typeof raw.threads === 'object' ? raw.threads : {},
    messages:
      raw.messages && typeof raw.messages === 'object' ? raw.messages : {},
    escrows:
      raw.escrows && typeof raw.escrows === 'object' ? raw.escrows : {},
    creators:
      raw.creators && typeof raw.creators === 'object' ? raw.creators : {},
    checkouts:
      raw.checkouts && typeof raw.checkouts === 'object' ? raw.checkouts : {},
  };
}

export async function readDB(): Promise<DB> {
  try {
    if (redis) {
      const data = await redis.get<DB>(KEY);
      const db = normalizeDB(data);
      memoryDB = db; // mirror in memory
      return db;
    }
    // no redis → use in-memory
    return normalizeDB(memoryDB);
  } catch (e) {
    console.error('readDB error', e);
    return normalizeDB(memoryDB);
  }
}

export async function writeDB(db: DB): Promise<void> {
  const normalized = normalizeDB(db);
  memoryDB = normalized;
  if (redis) {
    await redis.set(KEY, normalized);
  }
}

export function uid(): string {
  // @ts-ignore
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return (
    'id_' +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  );
}
