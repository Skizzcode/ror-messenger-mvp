// lib/ttl.ts
import { readDB, writeDB } from './db';

/** Sweep all expired open threads -> set to refunded. */
export async function sweepExpired(now = Date.now()) {
  const db = await readDB();
  let changed = 0;

  for (const [id, th] of Object.entries<any>(db.threads || {})) {
    if (th?.status === 'open' && typeof th.deadline === 'number' && th.deadline <= now) {
      th.status = 'refunded';
      th.refundedAt = now;
      changed++;
    }
  }

  if (changed) await writeDB(db);
  return { changed };
}

/** Lazy expiry for a single thread (call inside APIs before responding). */
export async function touchExpiryForThread(threadId: string) {
  const now = Date.now();
  const db = await readDB();
  const th = db.threads?.[threadId];
  if (th && th.status === 'open' && typeof th.deadline === 'number' && th.deadline <= now) {
    th.status = 'refunded';
    th.refundedAt = now;
    await writeDB(db);
  }
}
