// pages/creator/[handle].tsx
import useSWR from 'swr';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function CreatorDashboard({ handle }: { handle: string }) {
  // Threads + Settings + Stats
  const { data: threads } = useSWR(`/api/creator-threads?handle=${handle}`, fetcher, { refreshInterval: 3000 });
  const { data: settings, mutate: mutateSettings } = useSWR(`/api/creator-settings?handle=${handle}`, fetcher);
  const { data: stats } = useSWR(`/api/creator-stats?handle=${handle}`, fetcher, { refreshInterval: 5000 });

  // Local state (settings form)
  const [price, setPrice] = useState<number>(20);
  const [replyWindowHours, setReplyWindowHours] = useState<number>(48);
  const [walletStr, setWalletStr] = useState<string>('');

  const walletAdapter = useWallet();

  useEffect(() => {
    if (settings) {
      setPrice(settings.price ?? 20);
      setReplyWindowHours(settings.replyWindowHours ?? 48);
      setWalletStr(settings.wallet ?? '');
    }
  }, [settings]);

  // Totals
  const totals = useMemo(() => {
    const g = threads?.grouped;
    return {
      open: g?.open?.length || 0,
      answered: g?.answered?.length || 0,
      refunded: g?.refunded?.length || 0,
      all: g?.all?.length || 0,
    };
  }, [threads]);

  // Referral link (uses current origin)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const refLink = settings?.refCode ? `${baseUrl}/?ref=${settings.refCode}` : '';

  async function saveSettings() {
    const r = await fetch('/api/creator-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle, price, replyWindowHours, wallet: walletStr })
    });
    if (r.ok) mutateSettings();
    else {
      const j = await r.json().catch(() => ({}));
      alert(j?.error || 'Failed to save');
    }
  }

  function formatRemaining(ms: number) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-10 bg-black/40 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="font-black text-lg">RoR • Creator Dashboard</div>
          <div className="text-sm text-muted">@{handle}</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 grid gap-6 md:grid-cols-3">
        {/* LEFT: Overview + Threads */}
        <section className="md:col-span-2 space-y-6">
          {/* Overview grid (overgrids updated) */}
          <div className="grid grid-cols-4 gap-3">
            {/* Earnings card (spans 2 columns) */}
            <div className="p-3 rounded-xl border border-white/10 col-span-4 md:col-span-2">
              <div className="text-xs text-muted">Earnings (MTD)</div>
              <div className="text-2xl font-bold">€{(stats?.revenue?.mtd ?? 0).toFixed(2)}</div>
              <div className="text-xs text-muted mt-1">All-time: €{(stats?.revenue?.allTime ?? 0).toFixed(2)}</div>
            </div>
            {/* Quick stats */}
            <Stat label="Open" value={totals.open} />
            <Stat label="Answered" value={totals.answered} />
            <Stat label="Refunded" value={totals.refunded} />
            {/* Optional: total (mobile stacks below) */}
            <Stat label="All" value={totals.all} />
          </div>

          {/* Threads tabs */}
          <Tabs
            tabs={[
              { key: 'open', label: 'Open', items: threads?.grouped?.open || [] },
              { key: 'answered', label: 'Answered', items: threads?.grouped?.answered || [] },
              { key: 'refunded', label: 'Refunded', items: threads?.grouped?.refunded || [] },
            ]}
            renderItem={(t: any) => (
              <div key={t.id} className="p-3 rounded-xl border border-white/10 flex items-center justify-between">
                <div>
                  <div className="font-semibold">{t.id.slice(0, 8)}…</div>
                  <div className="text-xs text-muted">
                    {t.status.toUpperCase()} · {t.messagesCount} msgs
                    {t.status === 'open' && <> · ⏳ {formatRemaining(t.remainingMs)} left</>}
                  </div>
                </div>
                <Link href={`/c/${t.id}`} className="btn">Open chat</Link>
              </div>
            )}
          />
        </section>

        {/* RIGHT: Settings & Referral */}
        <aside className="space-y-6">
          {/* Settings */}
          <div className="card p-4 space-y-3">
            <div className="font-semibold">Settings</div>

            <label className="text-sm text-muted">Price (EUR or USDC equiv.)</label>
            <input
              className="input"
              type="number"
              min={1}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
            />

            <label className="text-sm text-muted">Reply window (hours)</label>
            <input
              className="input"
              type="number"
              min={1}
              value={replyWindowHours}
              onChange={(e) => setReplyWindowHours(Number(e.target.value))}
            />

            <label className="text-sm text-muted">Payout wallet (Solana pubkey)</label>
            <input
              className="input"
              placeholder="Your Solana public key"
              value={walletStr}
              onChange={(e) => setWalletStr(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-2">
              <button className="btn w-full" onClick={saveSettings}>Save</button>
              <button
                className="btn w-full"
                onClick={() => {
                  const pk = walletAdapter.publicKey?.toBase58();
                  if (!pk) { alert('Connect a wallet in your browser first.'); return; }
                  setWalletStr(pk);
                }}
              >
                Bind from connected wallet
              </button>
            </div>
          </div>

          {/* Referral */}
          <div className="card p-4 space-y-3">
            <div className="font-semibold">Referral</div>
            <p className="text-sm text-muted">Earn a recurring cut for each creator who joins via your link.</p>
            <div className="input break-all">{refLink || 'Loading…'}</div>
            <button
              className="btn w-full"
              onClick={() => { if (refLink) navigator.clipboard.writeText(refLink); }}
            >
              Copy link
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-3 rounded-xl border border-white/10 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function Tabs({
  tabs, renderItem
}: { tabs: { key: string; label: string; items: any[] }[]; renderItem: (x: any) => ReactNode }) {
  const [active, setActive] = useState(tabs[0]?.key || 'open');
  const items = tabs.find(t => t.key === active)?.items || [];
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={'px-3 py-1 rounded-full text-sm border ' + (active === t.key ? 'bg-accent text-black border-transparent' : 'border-white/20')}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {items.length ? items.map(renderItem) : <div className="text-muted text-sm">Nothing here.</div>}
      </div>
    </div>
  );
}

export async function getServerSideProps(ctx: any) {
  return { props: { handle: ctx.params.handle } };
}
