// pages/fan/index.tsx
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

const fetcher = (url:string)=>fetch(url).then(r=>r.json());

export default function FanDashboard(){
  const wallet = useWallet();
  const pubkey = wallet.publicKey?.toBase58();

  const { data } = useSWR(
    () => pubkey ? `/api/fan-threads?fanPubkey=${pubkey}` : null,
    fetcher,
    { refreshInterval: 3000 }
  );

  const totals = useMemo(()=>{
    const g = data?.grouped;
    return {
      open: g?.open?.length || 0,
      answered: g?.answered?.length || 0,
      refunded: g?.refunded?.length || 0,
      all: g?.all?.length || 0,
    };
  },[data]);

  function formatRemaining(ms:number){
    const h = Math.floor(ms/3600000);
    const m = Math.floor((ms%3600000)/60000);
    return `${h}h ${m}m`;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-10 bg-black/40 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="font-black text-lg">RoR • Fan Dashboard</div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted break-all max-w-[40vw]">
              {pubkey ? pubkey : 'Not connected'}
            </div>
            <WalletMultiButton className="!bg-accent !text-black !rounded-xl !h-8 !px-3 !py-0" />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 grid gap-6 md:grid-cols-3">
        {/* Left: Overview */}
        <section className="md:col-span-2 space-y-6">
          {!pubkey && (
            <div className="p-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 text-sm">
              Connect your wallet to view your chats.
            </div>
          )}

          {pubkey && (
            <>
              <div className="grid grid-cols-4 gap-3">
                <Stat label="Open" value={totals.open}/>
                <Stat label="Answered" value={totals.answered}/>
                <Stat label="Refunded" value={totals.refunded}/>
                <Stat label="All" value={totals.all}/>
              </div>

              <Tabs
                tabs={[
                  { key:'open', label:'Open', items: data?.grouped?.open || []},
                  { key:'answered', label:'Answered', items: data?.grouped?.answered || []},
                  { key:'refunded', label:'Refunded', items: data?.grouped?.refunded || []},
                ]}
                renderItem={(t:any)=>(
                  <div key={t.id} className="p-3 rounded-xl border border-white/10 flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{t.id.slice(0,8)}…</div>
                      <div className="text-xs text-muted">
                        {t.status.toUpperCase()} · {t.messagesCount} msgs ·
                        {t.status==='open' && <> ⏳ {formatRemaining(t.remainingMs)} left</>}
                      </div>
                    </div>
                    <Link href={`/c/${t.id}`} className="btn">Open chat</Link>
                  </div>
                )}
              />
            </>
          )}
        </section>

        {/* Right: Tips */}
        <aside className="space-y-6">
          <div className="card p-4 space-y-2">
            <div className="font-semibold">Tips</div>
            <ul className="text-sm text-muted list-disc pl-5 space-y-1">
              <li>Open chats show the remaining reply window.</li>
              <li>Answered chats are auto-paid from escrow.</li>
              <li>Refunded chats returned to your wallet after timeout.</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Stat({label, value}:{label:string; value:number}){
  return (
    <div className="p-3 rounded-xl border border-white/10 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

import { useState, type ReactNode } from 'react';
function Tabs({
  tabs, renderItem
}:{ tabs: {key:string; label:string; items:any[]}[]; renderItem:(x:any)=>ReactNode }){
  const [active, setActive] = useState(tabs[0]?.key || 'open');
  const items = tabs.find(t=>t.key===active)?.items || [];
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {tabs.map(t=>(
          <button key={t.key}
            onClick={()=>setActive(t.key)}
            className={'px-3 py-1 rounded-full text-sm border ' + (active===t.key?'bg-accent text-black border-transparent':'border-white/20')}>
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
