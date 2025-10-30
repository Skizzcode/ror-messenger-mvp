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

const fetcher = (url: string) => fetch(url).then(r => r.json());

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

  function formatRemaining(ms: number) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

  function formatPrice(amount: number | undefined) {
    const a = typeof amount === 'number' ? amount : 0;
    return `€${a.toFixed(2)}`;
  }

  return (
    <div className="min-h-screen bg-background text-white">
      {/* HEADER */}
      <header className="sticky top-0 z-10 bg-background/60 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/logo-ror-glass.svg"
              alt="RoR"
              className="h-9 w-9 rounded-2xl border border-white/10"
            />
            <div>
              <div className="font-black text-lg">Reply or Refund • Fan</div>
              <div className="text-xs text-white/40">
                Your paid chats in one place
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-white/40 break-all max-w-[40vw]">
              {pubkey ? pubkey : 'Not connected'}
            </div>
            <WalletMultiButton className="!bg-white !text-black !rounded-xl !h-8 !px-3 !py-0" />
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-5xl mx-auto px-4 py-6 grid gap-6 md:grid-cols-3">
        {/* LEFT: main content */}
        <section className="md:col-span-2 space-y-6">
          {!pubkey && (
            <div className="p-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 text-sm">
              Connect your wallet to view your chats.
            </div>
          )}

          {pubkey && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-4 gap-3">
                <Stat label="Open" value={totals.open} />
                <Stat label="Answered" value={totals.answered} />
                <Stat label="Refunded" value={totals.refunded} />
                <Stat label="All" value={totals.all} />
              </div>

              {/* Tabs */}
              <Tabs
                tabs={[
                  { key: 'open', label: 'Open', items: data?.grouped?.open || [] },
                  { key: 'answered', label: 'Answered', items: data?.grouped?.answered || [] },
                  { key: 'refunded', label: 'Refunded', items: data?.grouped?.refunded || [] },
                ]}
                renderItem={(t: any) => {
                  const cp = t.creatorProfile;
                  const name =
                    cp?.displayName ? cp.displayName : cp?.handle ? cp.handle : 'Creator';
                  const avatar = cp?.avatarDataUrl || '/logo-ror-glass.svg';
                  const price = formatPrice(t.amount);
                  return (
                    <div
                      key={t.id}
                      className="p-3 rounded-xl border border-white/10 flex items-center justify-between gap-3 bg-white/5"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={avatar}
                          alt={name}
                          className="h-10 w-10 rounded-2xl border border-white/10 object-cover"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="font-semibold">{name}</div>
                            <span
                              className={
                                'text-[10px] px-2 py-0.5 rounded-full ' +
                                (t.status === 'open'
                                  ? 'bg-emerald-400/10 text-emerald-100 border border-emerald-400/30'
                                  : t.status === 'answered'
                                  ? 'bg-white/10 text-white/80 border border-white/10'
                                  : 'bg-red-400/10 text-red-50 border border-red-400/20')
                              }
                            >
                              {t.status.toUpperCase()}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10">
                              {price}
                            </span>
                          </div>
                          <div className="text-xs text-white/40">
                            {t.messagesCount} messages
                            {t.status === 'open' && (
                              <> · ⏳ {formatRemaining(t.remainingMs)} left</>
                            )}
                          </div>
                        </div>
                      </div>
                      <Link href={`/c/${t.id}`} className="btn">
                        Open chat
                      </Link>
                    </div>
                  );
                }}
              />
            </>
          )}
        </section>

        {/* RIGHT: info */}
        <aside className="space-y-6">
          <div className="card p-4 space-y-2">
            <div className="font-semibold">How it works</div>
            <ul className="text-sm text-white/45 list-disc pl-5 space-y-1">
              <li>You pay once → chat opens.</li>
              <li>Creator has limited time to reply.</li>
              <li>No reply → automatic refund.</li>
            </ul>
          </div>
          <div className="card p-4 space-y-2">
            <div className="font-semibold">Stripe chats</div>
            <p className="text-sm text-white/45">
              If you paid with card before connecting a wallet, open the chat and bind it to your wallet.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-3 rounded-xl border border-white/10 text-center bg-white/5">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-white/40">{label}</div>
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
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={
              'px-3 py-1 rounded-full text-sm border ' +
              (active === t.key ? 'bg-white text-black border-transparent' : 'border-white/20')
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
          <div className="text-white/40 text-sm">Nothing here.</div>
        )}
      </div>
    </div>
  );
}
