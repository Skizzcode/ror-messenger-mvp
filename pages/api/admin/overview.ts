// pages/api/admin/overview.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../../lib/db';
import { checkRequestAuth } from '../../../lib/auth';
import { isAdminWallet } from '../../../lib/admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const limitThreads = Math.min(200, Number(req.query.limitThreads ?? 100));
  const limitMessages = Math.min(1000, Number(req.query.limitMessages ?? 200));

  const auth = await checkRequestAuth(req);
  if (!auth.ok || !auth.wallet) {
    return res.status(401).json({ ok: false, error: auth.error || 'UNAUTHORIZED' });
  }
  if (!isAdminWallet(auth.wallet)) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }

  const db = await readDB();

  const creators = Object.values<any>(db.creators || {}).map((c: any) => ({
    handle: c.handle,
    wallet: c.wallet || null,
    price: c.price,
    replyWindowHours: c.replyWindowHours,
    refCode: c.refCode || null,
    referredBy: c.referredBy || null,
    displayName: c.displayName || c.handle,
    email: c.email || '',
    banned: !!c.banned,
    avgReplyMs: c.avgReplyMs || null,
    answerRate: c.answerRate || null,
  }));

  const threadsArr = Object.values<any>(db.threads || {}).sort(
    (a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0)
  );
  const threads = threadsArr.slice(0, limitThreads).map((t: any) => ({
    id: t.id,
    creator: t.creator,
    fan: t.fan,
    amount: t.amount,
    status: t.status,
    createdAt: t.createdAt,
    deadline: t.deadline,
    paid_via: t.paid_via,
    ref: t.ref || null,
    fan_pubkey: t.fan_pubkey || null,
    creator_pubkey: t.creator_pubkey || null,
  }));

  // Flatten messages with thread info (limited)
  const messages: any[] = [];
  let count = 0;
  for (const [threadId, arrAny] of Object.entries<any[]>(db.messages || {})) {
    if (count >= limitMessages) break;
    const arr = Array.isArray(arrAny) ? arrAny : [];
    for (const m of arr) {
      if (count >= limitMessages) break;
      messages.push({
        ...m,
        threadId,
      });
      count++;
    }
  }
  messages.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return res.status(200).json({
    ok: true,
    creatorsCount: creators.length,
    threadsCount: threadsArr.length,
    messagesCount: count,
    creators,
    threads,
    messages,
  });
}
