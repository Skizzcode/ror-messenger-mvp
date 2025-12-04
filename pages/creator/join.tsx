// pages/creator/join.tsx
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { t } from '../../lib/telemetry';

const WalletMultiButtonDynamic = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then(m => m.WalletMultiButton),
  { ssr: false }
);

export default function CreatorJoin() {
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [price, setPrice] = useState<number>(20);
  const [replyWindowHours, setReplyWindowHours] = useState<number>(48);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const ref = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const u = new URL(window.location.href);
    return u.searchParams.get('ref');
  }, []);

  useEffect(() => {
    t('page_view', { scope: 'creator_join', props: { hasRef: !!ref } });
  }, [ref]);

  async function submit() {
    if (!ref) return;
    if (!handle.trim()) { setMsg('Please choose a handle.'); return; }
    if (!email.trim() || !email.includes('@')) { setMsg('Please enter a valid email.'); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/creator-joins', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ ref, handle, wallet: null, email }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'JOIN_FAILED');

      t('join_attempt', { scope:'creator_join', props: { ref, handle } });
      setMsg('Thanks! We will review your access and get back shortly.');
    } catch (e:any) {
      setMsg('Failed to submit. Please try again later.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-white">
      {/* Global header: logo + wallet connect */}
      <header className="sticky top-0 z-30 bg-black/20 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <img
              src="/logo-ror-glass.svg"
              alt="RoR"
              className="h-8 w-8 rounded-2xl border border-white/10 shadow-sm"
            />
            <span className="font-semibold tracking-tight group-hover:opacity-80 transition">
              Reply or Refund
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <WalletMultiButtonDynamic className="!bg-white !text-black !rounded-2xl !h-8 !px-3 !py-0 !text-sm !shadow" />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {!ref ? (
          // Referral-only waitlist copy
          <div className="rounded-3xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl p-6">
            <h1 className="text-2xl font-bold">Invite-only access</h1>
            <p className="text-white/70 mt-2">
              Creator onboarding is invite-only right now.
              Ask an existing creator for their referral link to join.
            </p>
            <div className="mt-4 text-sm text-white/45">
              Why? We care about quality, verified profiles, and fast replies —
              that keeps paid DMs valuable and the experience Apple-clean.
            </div>
            <div className="mt-6">
              <Link href="/" className="bg-white text-black text-sm px-5 py-2 rounded-2xl shadow-sm">
                Back to home
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl p-6 space-y-4">
            <h1 className="text-2xl font-bold">Creator onboarding</h1>
            <div className="text-sm text-white/45">Referral code: <b>{ref}</b></div>

            <label className="text-sm text-white/60">Handle (public)</label>
            <input
              className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/15"
              placeholder="e.g. alice"
              value={handle}
              onChange={(e)=>setHandle(e.target.value.replace(/\s+/g,''))}
            />

            <label className="text-sm text-white/60">Email (for payouts/ops)</label>
            <input
              className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/15"
              placeholder="you@example.com"
              value={email}
              onChange={(e)=>setEmail(e.target.value)}
            />

            <label className="text-sm text-white/60">Display name</label>
            <input
              className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/15"
              placeholder="e.g. Alice"
              value={displayName}
              onChange={(e)=>setDisplayName(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-white/60">Price (EUR / USDC)</label>
                <input
                  type="number"
                  min={1}
                  className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-sm"
                  value={price}
                  onChange={(e)=>setPrice(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-sm text-white/60">Reply window (hours)</label>
                <input
                  type="number"
                  min={1}
                  className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-sm"
                  value={replyWindowHours}
                  onChange={(e)=>setReplyWindowHours(Number(e.target.value))}
                />
              </div>
            </div>

            {msg && <div className="text-sm text-white/70">{msg}</div>}

            <div className="pt-2 flex gap-2">
              <button
                onClick={submit}
                disabled={busy}
                className="bg-white text-black text-sm px-5 py-2 rounded-2xl shadow-sm disabled:opacity-50"
              >
                Request access
              </button>
              <Link href="/" className="text-sm px-4 py-2 rounded-2xl border border-white/15">
                Cancel
              </Link>
            </div>

            <div className="text-[11px] text-white/45 pt-2">
              Note: Escrow & refunds are not on-chain in the MVP.
              With the on-chain program live, you’ll see txids and receipts here.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
