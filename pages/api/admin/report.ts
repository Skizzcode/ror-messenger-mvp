// pages/api/admin/report.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../../lib/db';
import { checkRequestAuth } from '../../../lib/auth';
import { isAdminWallet } from '../../../lib/admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const { threadId, handle } = req.query as { threadId?: string; handle?: string };
  const auth = await checkRequestAuth(req, { allowCookie: false });
  if (!auth.ok || !auth.wallet) return res.status(401).json({ ok: false, error: auth.error || 'UNAUTHORIZED' });
  if (!isAdminWallet(auth.wallet)) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

  const db = await readDB();

  const thread = threadId ? db.threads?.[String(threadId)] : null;
  const creatorHandle = handle || thread?.creator;
  const creator = creatorHandle ? (db.creators || {})[creatorHandle as string] : null;
  const messages = thread ? db.messages?.[thread.id] || [] : [];
  const flags = Array.isArray((db as any).flags) ? (db as any).flags.filter((f: any) => f.threadId === (thread?.id || '')) : [];

  return res.status(200).json({
    ok: true,
    thread: thread || null,
    creator: creator ? { handle: creator.handle, wallet: creator.wallet, email: creator.email, banned: !!creator.banned } : null,
    messages,
    flags,
  });
}
