// pages/api/creator-stats.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const handle = req.query.handle as string;
  if (!handle) return res.status(400).json({ error: 'Missing handle' });

  const db = await readDB(); // <-- async

  const threads = Object.values<any>(db.threads || {}).filter(
    (t: any) => t?.creator === handle
  );

  const now = new Date();
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let allTime = 0, mtd = 0, answered = 0, open = 0, refunded = 0;

  for (const t of threads) {
    const amount = Number(t?.amount || 0);
    if (t?.status === 'answered') {
      answered++; allTime += amount;
      if ((t?.answeredAt || 0) >= mtdStart) mtd += amount;
    } else if (t?.status === 'open') {
      open++;
    } else if (t?.status === 'refunded') {
      refunded++;
    }
  }

  return res.json({
    handle,
    counts: { open, answered, refunded, total: threads.length },
    revenue: { allTime, mtd }
  });
}
