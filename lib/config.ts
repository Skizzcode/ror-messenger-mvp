// lib/config.ts
export const OPEN_SIGNUPS =
  String(process.env.OPEN_SIGNUPS || '').toLowerCase() === 'true';

export const ADMIN_INVITE_CODES = (process.env.ADMIN_INVITE_CODES || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
