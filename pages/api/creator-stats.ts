import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';
import { checkRequestAuth } from '../../lib/auth';
import { writeDB } from '../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const handle = String(req.query.handle || '').trim().toLowerCase();
  if (!handle) return res.status(400).json({ error: 'Missing handle' });

  // 🔒 Owner-Gate (async)
  const auth = await checkRequestAuth(req);
  if (!auth.ok) return res.status(401).json({ error: auth.error });

  const db = await readDB();
  const creator = (db.creators || {})[handle];
  if (!creator) return res.status(404).json({ error: 'Creator not found' });
  if (!creator.wallet) return res.status(403).json({ error: 'Forbidden: no wallet bound yet' });
  if (creator.wallet !== auth.wallet) return res.status(403).json({ error: 'Forbidden: wrong wallet' });

  const threads = Object.values<any>(db.threads || {}).filter((t: any) => t?.creator === handle);

  const now = new Date();
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let allTime = 0;
  let mtd = 0;
  let answered = 0;
  let open = 0;
  let refunded = 0;

  for (const t of threads) {
    const amount = Number(t?.amount || 0);
    const status = t?.status;

    if (status === 'answered') {
      answered++;
      allTime += amount;
      const answeredAt = Number(t?.answeredAt || 0);
      if (answeredAt >= mtdStart) mtd += amount;
      const createdAt = Number(t?.createdAt || 0);
      if (createdAt && answeredAt && answeredAt > createdAt) {
        const diff = answeredAt - createdAt;
        replyTimes.push(diff);
      }
    } else if (status === 'open') {
      open++;
    } else if (status === 'refunded') {
      refunded++;
    }
  }

  const avgReplyMs = replyTimes.length ? Math.round(replyTimes.reduce((a, b) => a + b, 0) / replyTimes.length) : null;
  const answerRate = threads.length ? answered / threads.length : null;

  // Persist SLA metrics on creator entry for reuse
  const creatorEntry = (db.creators || {})[handle];
  if (creatorEntry) {
    creatorEntry.avgReplyMs = avgReplyMs;
    creatorEntry.answerRate = answerRate;
    await writeDB(db);
  }

  return res.json({
    handle,
    counts: { open, answered, refunded, total: threads.length },
    revenue: { allTime, mtd },
    sla: { avgReplyMs, answerRate },
  });
}
