// pages/creator/join.tsx
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

function debounce<T extends (...args: any[]) => any>(fn: T, ms = 300) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function buildAuthHeaders(wallet: any) {
  if (!wallet?.publicKey || !wallet?.signMessage) return null;
  const pub = wallet.publicKey.toBase58();
  const msg = `ROR|auth|wallet=${pub}|ts=${Date.now()}`;
  const enc = new TextEncoder().encode(msg);
  const sig = await wallet.signMessage(enc);
  const { default: bs58 } = await import('bs58');
  return { 'x-wallet': pub, 'x-msg': msg, 'x-sig': bs58.encode(sig) };
}

export default function CreatorJoin() {
  const wallet = useWallet();

  const [mounted, setMounted] = useState(false);
  const [refCode, setRefCode] = useState<string>('');

  const [handle, setHandle] = useState('');
  const cleanHandle = useMemo(
    () => handle.toLowerCase().replace(/[^a-z0-9\-_.]/g, ''),
    [handle]
  );

  const [displayName, setDisplayName] = useState('');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);

  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href);
      const r = u.searchParams.get('ref');
      if (r) setRefCode(r);
    }
  }, []);

  // Debounced Availability Check
  const debouncedCheck = useMemo(
    () =>
      debounce(async (h: string) => {
        if (!h || h.length < 3) {
          setAvailable(null);
          setChecking(false);
          return;
        }
        try {
          const r = await fetch(`/api/creator-available?handle=${encodeURIComponent(h)}`);
          const j = await r.json();
          setAvailable(!!j.available);
        } catch {
          setAvailable(null);
        } finally {
          setChecking(false);
        }
      }, 300),
    []
  );

  useEffect(() => {
    setChecking(true);
    debouncedCheck(cleanHandle);
  }, [cleanHandle, debouncedCheck]);

  async function onAvatarFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1_000_000) {
      alert('Image too large. Please use < 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result;
      if (typeof result === 'string') setAvatarDataUrl(result);
    };
    reader.readAsDataURL(f);
  }

  async function submit() {
    // harte Regeln: Wallet + gültiger Handle + verfügbar + Ref nötig (Server enforced)
    if (!wallet.publicKey) { alert('Connect wallet first.'); return; }
    if (!/^[a-z0-9\-_.]{3,24}$/.test(cleanHandle)) {
      alert('Handle must be 3–24 chars (a-z, 0-9, -, _, .)');
      return;
    }
    if (available !== true) {
      alert('Handle is not available.');
      return;
    }
    setSubmitting(true);
    try {
      const headers = await buildAuthHeaders(wallet as any);
      if (!headers) throw new Error('Wallet must support message signing.');
      const r = await fetch('/api/creator-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(headers as any) },
        body: JSON.stringify({
          handle: cleanHandle,
          displayName: displayName.trim() || cleanHandle,
          avatarDataUrl,
          ref: refCode || null, // Server verlangt Ref, wenn OPEN_SIGNUPS=false
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Failed to create');
      window.location.href = `/creator/${j.handle}`;
    } catch (e: any) {
      alert(e?.message || 'Error');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !!cleanHandle &&
    /^[a-z0-9\-_.]{3,24}$/.test(cleanHandle) &&
    available === true &&
    !submitting;

  return (
    <div className="min-h-screen bg-background text-white flex flex-col">
      {/* Header */}
      <header className="w-full border-b border-white/10 bg-background/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-ror-glass.svg" alt="RoR" className="h-9 w-9 rounded-2xl border border-white/10" />
            <div className="text-sm font-semibold">Reply or Refund</div>
          </Link>
          {mounted && (
            <WalletMultiButton className="!bg-white !text-black !rounded-xl !h-8 !px-3 !py-0 !text-sm" />
          )}
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <div className="card p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold">Claim your creator inbox</div>
              <div className="text-xs text-white/40">Invite-only. Handle, avatar, and name in one minute.</div>
            </div>
            {refCode && (
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">
                invited by {refCode}
              </span>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Handle */}
            <div className="space-y-2">
              <label className="text-sm text-white/60">Handle</label>
              <div className="flex items-center gap-2">
                <input
                  className="input"
                  placeholder="your-handle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                />
                <span
                  className={
                    'text-[11px] px-2 py-1 rounded-full border ' +
                    (checking
                      ? 'border-white/15 text-white/40'
                      : available === true
                      ? 'bg-emerald-400/10 text-emerald-100 border-emerald-400/30'
                      : available === false
                      ? 'bg-red-400/10 text-red-50 border-red-400/30'
                      : 'border-white/15 text-white/40')
                  }
                >
                  {checking ? 'Checking…' : available === true ? 'Available' : available === false ? 'Taken' : '—'}
                </span>
              </div>
              <div className="text-[11px] text-white/35">Public URL: /c/{cleanHandle || 'your-handle'}</div>
            </div>

            {/* Display name */}
            <div className="space-y-2">
              <label className="text-sm text-white/60">Display name</label>
              <input
                className="input"
                placeholder="Your public name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            {/* Avatar */}
            <div className="space-y-2">
              <label className="text-sm text-white/60">Avatar (upload)</label>
              <input
                type="file"
                accept="image/*"
                onChange={onAvatarFileSelected}
                className="text-xs text-white/50"
              />
              {avatarDataUrl ? (
                <img
                  src={avatarDataUrl}
                  alt="avatar"
                  className="h-16 w-16 rounded-2xl border border-white/10 object-cover"
                />
              ) : (
                <div className="text-[11px] text-white/35">No avatar selected.</div>
              )}
            </div>

            {/* Referral */}
            <div className="space-y-2">
              <label className="text-sm text-white/60">Referral / Invite code</label>
              <input
                className="input"
                placeholder="Paste your referral code"
                value={refCode}
                onChange={(e) => setRefCode(e.target.value)}
              />
              <div className="text-[11px] text-white/40">
                Access is invite-only. Ask a creator for their link/code.
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={submit} disabled={!canSubmit} className="btn">
              {submitting ? 'Creating…' : 'Create my inbox'}
            </button>
            <Link href="/" className="text-sm px-4 py-2 rounded-full border border-white/15 hover:bg-white/5">
              Cancel
            </Link>
          </div>

          <p className="text-[11px] text-white/35">
            After creation, set price & reply window in your dashboard. Fans pay by wallet or card.
            If you don’t reply in time, the chat auto-refunds.
          </p>
        </div>
      </main>
    </div>
  );
}
