// pages/api/creator-session/end.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { clearSessionCookie } from '../../../lib/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  try {
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}
