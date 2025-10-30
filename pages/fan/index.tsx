// pages/fan/index.tsx
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function FanDashboard() {
  const wallet = useWallet();
  const pubkey = wallet.publicKey?.toBase58();

  const { data } = useSWR(
    () => (pubkey ? `/api/fan-threads?fanPubkey=${pubkey}` : null),
    fetcher,
    { refreshInterval: 3000 }
  );

  const totals = useMemo(() => {
    const g = data?.grouped;
    return {
      open: g?.open?.length || 0,
      answered: g?.answered?.length || 0,
      refunded: g?.refunded?.length || 0,
      all: g?.all?.length || 0,
    };
  }, [data]);

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-white">
      <header className="sticky top-0 z-20 bg-black/20 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo-ror-glass.svg"
              alt="RoR"
              className="h-8 w-8 rounded-2xl border border-white/10 shadow-sm"
            />
            <div>
              <div className="text-sm text-white/40">Reply or Refund</div>
              <div className="text-xl font-semibold tracking-tight">My chats</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-[10px] text-white/30 max-w-[36vw] md:max-w-none break-all">
              {pubkey || 'Not connected'}
            </div>
            <WalletMultiButton className="!bg-white !text-black !rounded-2xl !h-8 !px-3 !py-0 !text-sm" />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 grid gap-6 md:grid-cols-3">
        {/* Left */}
        <section className="md:col-span-2 space-y-6">
          {!pubkey && (
            <div className="p-3 rounded-2xl bg-yellow-400/10 border border-yellow-400/30 text-sm">
              Connect your wallet to view your threads.
            </div>
          )}

          {pubkey && (
            <>
              <div className="grid grid-cols-4 gap-3">
                <Stat label="Open" value={totals.open} />
                <Stat label="Answered" value={totals.answered} />
                <Stat label="Refunded" value={totals.refunded} />
                <Stat label="All" value={totals.all} />
              </div>

              <Tabs
                tabs={[
                  { key: 'open', label: 'Open', items: data?.grouped?.open || [] },
                  { key: 'answered', label: 'Answered', items: data?.grouped?.answered || [] },
                  { key: 'refunded', label: 'Refunded', items: data?.grouped?.refunded || [] },
                ]}
                renderItem={(t: any) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-2xl bg-white/[0.01] border border-white/[0.04] flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-sm">Chat {t.id.slice(0, 8)}…</div>
                      <div className="text-xs text-white/40">
                        {t.status.toUpperCase()} · {t.messagesCount} msgs
                        {t.status === 'open' ? (
                          <>
                            {' '}
                            · ⏳ {formatRemaining(t.remainingMs)} left
                          </>
                        ) : null}
                      </div>
                    </div>
                    <Link
                      href={`/c/${t.id}`}
                      className="bg-white text-black text-xs px-3 py-1.5 rounded-xl"
                    >
                      Open chat
                    </Link>
                  </div>
                )}
              />
            </>
          )}
        </section>

        {/* Right */}
        <aside className="space-y-4">
          <div className="rounded-2xl bg-white/[0.01] border border-white/[0.04] p-4">
            <div className="text-sm font-medium mb-2">Tips</div>
            <ul className="text-xs text-white/40 space-y-1">
              <li>Open chats show the countdown.</li>
              <li>Creator reply → escrow pays.</li>
              <li>No reply → auto-refund.</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.03] text-center backdrop-blur-sm">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-[10px] text-white/40 uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function Tabs({
  tabs,
  renderItem,
}: {
  tabs: { key: string; label: string; items: any[] }[];
  renderItem: (x: any) => ReactNode;
}) {
  const [active, setActive] = useState(tabs[0]?.key || 'open');
  const items = tabs.find((t) => t.key === active)?.items || [];
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={
              'px-3 py-1.5 rounded-full text-sm border ' +
              (active === t.key ? 'bg-white text-black border-transparent' : 'border-white/10')
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {items.length ? (
          items.map(renderItem)
        ) : (
          <div className="text-xs text-white/25">Nothing here.</div>
        )}
      </div>
    </div>
  );
}

function formatRemaining(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}
