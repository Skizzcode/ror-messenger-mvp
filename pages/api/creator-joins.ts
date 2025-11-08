// pages/api/creator-join.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { track } from '../../lib/telemetry';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  try {
    const { ref, handle, wallet } = req.body || {};
    await track({
      event: 'join_attempt',
      scope: 'creator',
      handle: handle || null,
      meta: {
        hasRef: Boolean(ref),
        ref: ref || null,
        walletBound: Boolean(wallet),
      },
    });

    // Dieser Endpoint ist nur Telemetry – die eigentliche Join-Logik liegt bei euch.
    // Wir antworten "accepted: true" zur Client-Beruhigung.
    return res.status(200).json({ ok: true, accepted: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: e?.message });
  }
}
