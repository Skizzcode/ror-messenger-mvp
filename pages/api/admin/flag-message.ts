// pages/api/admin/flag-message.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB } from '../../../lib/db';
import { checkRequestAuth } from '../../../lib/auth';
import { isAdminWallet } from '../../../lib/admin';
import { logAudit } from '../../../lib/audit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const { threadId, messageId, reason, archive } = (req.body || {}) as {
    threadId?: string;
    messageId?: string;
    reason?: string;
    archive?: boolean;
  };
  const cleanThread = (threadId || '').trim();
  const cleanMessage = (messageId || '').trim();
  if (!cleanThread || !cleanMessage) return res.status(400).json({ ok: false, error: 'BAD_INPUT' });

  const auth = await checkRequestAuth(req);
  if (!auth.ok || !auth.wallet) return res.status(401).json({ ok: false, error: auth.error || 'UNAUTHORIZED' });
  if (!isAdminWallet(auth.wallet)) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

  const db = await readDB();
  const msgs = db.messages?.[cleanThread] || [];
  const msg = msgs.find((m: any) => m.id === cleanMessage);
  if (!msg) return res.status(404).json({ ok: false, error: 'MESSAGE_NOT_FOUND' });

  msg.flagged = true;
  msg.flagReason = reason || 'unspecified';
  if (archive) msg.archived = true;

  if (!Array.isArray((db as any).flags)) (db as any).flags = [];
  (db as any).flags.push({
    id: `flag_${Date.now().toString(36)}`,
    threadId: cleanThread,
    messageId: cleanMessage,
    reason: msg.flagReason,
    archived: !!archive,
    ts: Date.now(),
    admin: auth.wallet,
  });

  await writeDB(db);
  await logAudit({
    ts: Date.now(),
    kind: 'flag_message',
    actor: auth.wallet,
    detail: { threadId: cleanThread, messageId: cleanMessage, reason: msg.flagReason, archive: !!archive },
  });

  return res.status(200).json({ ok: true, flagged: true, archived: !!archive });
}
