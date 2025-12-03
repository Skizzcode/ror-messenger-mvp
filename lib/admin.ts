// lib/admin.ts
// Simple helper to gate admin actions by wallet.

const DEFAULT_ADMIN = '8euxkmCUTTuG31wzjcbPVRJTegt2NTJSpXSEAKP2uRYx';

function parseAdmins(): string[] {
  const raw = process.env.ADMIN_WALLETS || process.env.ADMIN_WALLET || DEFAULT_ADMIN;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.toLowerCase());
}

const ADMIN_WALLETS = parseAdmins();

export function isAdminWallet(wallet: string | null | undefined): boolean {
  if (!wallet) return false;
  return ADMIN_WALLETS.includes(wallet.trim().toLowerCase());
}

export function adminList(): string[] {
  return ADMIN_WALLETS;
}
