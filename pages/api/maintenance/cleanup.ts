// pages/api/maintenance/cleanup.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB } from '../../../lib/db';
import { refundEscrow } from '../../../lib/escrow';

type CleanupReport = {
  now: number;
  autoRefunded: number;
  messagesDeleted: number;
  threadsArchived: number;
  retentionDays: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Optional query overrides: ?retentionDays=90
  const retentionDays = Math.max(1, Number(req.query.retentionDays ?? 90));
  const retentionMs = retentionDays * 24 * 3600 * 1000;

  const db = readDB();
  const now = Date.now();

  let autoRefunded = 0;
  let messagesDeleted = 0;
  let threadsArchived = 0;

  // 1) Auto-refund: open + deadline abgelaufen
  for (const th of Object.values<any>(db.threads || {})) {
    if (th.status === 'open' && typeof th.deadline === 'number' && th.deadline < now) {
      await refundEscrow({ threadId: th.id }); // stub; später on-chain
      th.status = 'refunded';
      th.refundedAt = now;
      autoRefunded++;
    }
  }

  // 2) Message retention: alte Messages löschen
  for (const threadId of Object.keys(db.messages || {})) {
    const arr = db.messages[threadId] || [];
    const before = arr.length;
    const kept = arr.filter((m: any) => (now - (m.ts || 0)) <= retentionMs);
    messagesDeleted += before - kept.length;
    db.messages[threadId] = kept;
  }

  // 3) Optional: Threads archivieren, wenn alt (z.B. 180 Tage)
  const archiveMs = Math.max(retentionMs, 180 * 24 * 3600 * 1000);
  for (const th of Object.values<any>(db.threads || {})) {
    const lastTs =
      (db.messages?.[th.id]?.at(-1)?.ts) ??
      th.answeredAt ?? th.refundedAt ?? th.createdAt ?? 0;
    if ((now - lastTs) > archiveMs && !th.archived) {
      th.archived = true;
      th.archivedAt = now;
      threadsArchived++;
    }
  }

  writeDB(db);

  const report: CleanupReport = {
    now,
    autoRefunded,
    messagesDeleted,
    threadsArchived,
    retentionDays
  };
  return res.json(report);
}
