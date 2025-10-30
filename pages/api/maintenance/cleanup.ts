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
  dryRun: boolean;
  limit: number;
  touchedThreadIds: string[];
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const retentionDays = Math.max(1, Number(req.query.retentionDays ?? 90));
  const limit = Math.max(1, Math.min(5000, Number(req.query.limit ?? 1000)));
  const dryRun = String(req.query.dryRun ?? 'false') === 'true';

  const retentionMs = retentionDays * 24 * 3600 * 1000;
  const archiveMs = Math.max(retentionMs, 180 * 24 * 3600 * 1000);
  const now = Date.now();

  const db = await readDB();

  let autoRefunded = 0;
  let messagesDeleted = 0;
  let threadsArchived = 0;
  const touchedThreadIds: string[] = [];

  // 1) Auto-refund: open + deadline abgelaufen
  for (const [id, th] of Object.entries<any>(db.threads || {})) {
    if (autoRefunded >= limit) break;
    if (th?.status === 'open' && typeof th.deadline === 'number' && th.deadline <= now) {
      try {
        if (!dryRun) {
          await refundEscrow({ threadId: id }); // stub; später on-chain
          th.status = 'refunded';
          th.refundedAt = now;
        }
        autoRefunded++;
        touchedThreadIds.push(id);
      } catch {
        // ignore in MVP
      }
    }
  }

  // 2) Message retention: alte Messages löschen
  for (const [threadId, arrAny] of Object.entries<any[]>(db.messages || {})) {
    const arr = Array.isArray(arrAny) ? arrAny : [];
    const before = arr.length;
    const kept = arr.filter((m: any) => (now - (m?.ts || 0)) <= retentionMs);
    const diff = before - kept.length;
    if (diff > 0) {
      messagesDeleted += diff;
      if (!dryRun) db.messages[threadId] = kept;
      touchedThreadIds.push(threadId);
    }
    if (messagesDeleted >= limit) break;
  }

  // 3) Threads archivieren, wenn lange inaktiv
  for (const [id, th] of Object.entries<any>(db.threads || {})) {
    if (threadsArchived >= limit) break;
    const msgs = db.messages?.[id] || [];
    const lastTs =
      (msgs.length ? msgs[msgs.length - 1]?.ts : undefined) ??
      th?.answeredAt ?? th?.refundedAt ?? th?.createdAt ?? 0;
    if (!th?.archived && (now - lastTs) > archiveMs) {
      if (!dryRun) {
        th.archived = true;
        th.archivedAt = now;
      }
      threadsArchived++;
      touchedThreadIds.push(id);
    }
  }

  if (!dryRun) await writeDB(db);

  const report: CleanupReport = {
    now,
    autoRefunded,
    messagesDeleted,
    threadsArchived,
    retentionDays,
    dryRun,
    limit,
    touchedThreadIds,
  };
  return res.json(report);
}
