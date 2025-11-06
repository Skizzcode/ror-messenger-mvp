// pages/api/ref-stats.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const code = (req.query.code as string | undefined)?.trim();
  if (!code) return res.status(400).json({ error: 'Missing code' });

  const db = await readDB();
  const creators = db.creators || {};
  const threads = db.threads || {};
  const messages = db.messages || {}; // not used, but here if needed later

  // creators directly referred by this code
  const referred = Object.values<any>(creators).filter((c) => c?.referredBy === code);

  const referredHandles = new Set(referred.map((c: any) => c.handle));

  // threads by referred creators
  let totalThreads = 0;
  let revenueAll = 0;
  let revenueAnswered = 0;
  let answeredThreads = 0;

  for (const t of Object.values<any>(threads)) {
    if (!t?.creator) continue;
    if (!referredHandles.has(t.creator)) continue;

    totalThreads += 1;
    const amt = Number(t.amount || 0);
    revenueAll += amt;
    if (t.status === 'answered') {
      revenueAnswered += amt;
      answeredThreads += 1;
    }
  }

  const result = {
    code,
    creatorsCount: referred.length,
    creators: referred
      .map((c: any) => ({
        handle: c.handle,
        displayName: c.displayName || c.handle,
        createdAt: c.createdAt || null,
      }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    totals: {
      totalThreads,
      answeredThreads,
      revenueAll,       // sum of all thread amounts from referred creators
      revenueAnswered,  // sum of answered-only (actually paid)
    },
  };

  return res.json(result);
}
