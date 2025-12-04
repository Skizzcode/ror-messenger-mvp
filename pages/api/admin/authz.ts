// pages/api/admin/authz.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { checkRequestAuth } from '../../../lib/auth';
import { isAdminWallet } from '../../../lib/admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  // Admin must sign per request; cookies are NOT accepted
  const auth = await checkRequestAuth(req, { allowCookie: false });
  if (!auth.ok || !auth.wallet) {
    return res.status(401).json({ ok: false, error: auth.error || 'UNAUTHORIZED' });
  }
  if (!isAdminWallet(auth.wallet)) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }

  return res.status(200).json({ ok: true, wallet: auth.wallet });
}
