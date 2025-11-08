// lib/api.ts
import type { NextApiResponse, NextApiRequest } from 'next';
import { track } from './telemetry';

export function apiOk<T = any>(res: NextApiResponse, body: T) {
  return res.status(200).json({ ok: true, ...(body as any) });
}

export async function apiErr(
  req: NextApiRequest,
  res: NextApiResponse,
  status: number,
  error: string,
  meta?: Record<string, any>
) {
  try {
    await track({
      event: 'api_error',
      scope: 'security',
      meta: {
        route: req.url || '',
        method: req.method || '',
        status,
        error,
        ...(meta || {}),
      },
    });
  } catch {
    // Telemetry-Ausfall soll nie die API blockieren
  }
  return res.status(status).json({ ok: false, error, ...(meta || {}) });
}
