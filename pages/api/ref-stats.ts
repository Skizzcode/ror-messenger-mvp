// pages/api/ref-stats.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';
import { checkRequestAuth } from '../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const code = String(req.query.code || '').trim();
  if (!code) return res.status(400).json({ error: 'Missing code' });

  // 🔒 Owner-Gate: nur der Besitzer dieses refCode darf die Stats sehen
  const auth = checkRequestAuth(req);
  if (!auth.ok) return res.status(401).json({ error: auth.error });

  const db = await readDB();
  const creators = db.creators || {};

  // Finde den Owner des Referral-Codes
  const owner = Object.values<any>(creators).find((c: any) => c?.refCode === code);
  if (!owner) return res.status(404).json({ error: 'Referral code not found' });

  if (!owner.wallet) return res.status(403).json({ error: 'Forbidden: owner has no wallet bound' });
  if (owner.wallet !== auth.wallet) return res.status(403).json({ error: 'Forbidden: wrong wallet' });

  // Alle Creator, die von diesem Code geworben wurden
  const referredCreators = Object.values<any>(creators)
    .filter((c: any) => (c?.referredBy || '').trim() === code)
    .map((c: any) => ({
      handle: c.handle,
      displayName: c.displayName || c.handle,
      avatarDataUrl: c.avatarDataUrl || null,
      walletBound: !!c.wallet,
    }));

  // Umsatz der geworbenen Creator aggregieren
  // (GMV = Summe aller Threads dieser Creators;
  //  answered = nur beantwortete Threads)
  const threads = db.threads || {};
  let revenueAll = 0;
  let revenueAnswered = 0;

  const referredHandles = new Set(referredCreators.map(c => c.handle));

  for (const t of Object.values<any>(threads)) {
    if (!t?.creator) continue;
    if (!referredHandles.has(t.creator)) continue;

    const amount = Number(t.amount || 0);
    revenueAll += amount;
    if (t.status === 'answered') {
      revenueAnswered += amount;
    }
  }

  return res.json({
    code,
    owner: {
      handle: owner.handle,
      displayName: owner.displayName || owner.handle,
    },
    creatorsCount: referredCreators.length,
    creators: referredCreators.sort((a, b) => a.handle.localeCompare(b.handle)),
    totals: {
      revenueAll,
      revenueAnswered,
    },
  });
}
