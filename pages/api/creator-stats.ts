// pages/api/creator-stats.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';
import { checkRequestAuth } from '../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const handle = String(req.query.handle || '').trim().toLowerCase();
  if (!handle) return res.status(400).json({ error: 'Missing handle' });

  // 🔒 Owner-Gate (wallet signature in headers)
  const auth = checkRequestAuth(req);
  if (!auth.ok) return res.status(401).json({ error: auth.error });

  const db = await readDB();
  const creator = (db.creators || {})[handle];
  if (!creator) return res.status(404).json({ error: 'Creator not found' });
  if (!creator.wallet) return res.status(403).json({ error: 'Forbidden: no wallet bound yet' });
  if (creator.wallet !== auth.wallet) return res.status(403).json({ error: 'Forbidden: wrong wallet' });

  // Threads dieses Creators
  const threads = Object.values<any>(db.threads || {}).filter((t: any) => t?.creator === handle);

  // Month-to-date Start
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

      // MTD zählt Umsatz, wenn die Antwort (Payout) in diesem Monat passierte
      const answeredAt = Number(t?.answeredAt || 0);
      if (answeredAt >= mtdStart) mtd += amount;
    } else if (status === 'open') {
      open++;
    } else if (status === 'refunded') {
      refunded++;
    }
  }

  return res.json({
    handle,
    counts: { open, answered, refunded, total: threads.length },
    revenue: { allTime, mtd },
  });
}
