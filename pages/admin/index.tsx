// pages/admin/index.tsx
import useSWR from 'swr';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { t } from '../../lib/telemetry';

const WalletMultiButtonDynamic = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false }
);

const fetchJSON = (url: string, init?: RequestInit) =>
  fetch(url, init).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

async function signAuthHeaders(wallet: any) {
  if (!wallet?.publicKey || !wallet?.signMessage) return null;
  const pub = wallet.publicKey.toBase58();
  const msg = `ROR|auth|wallet=${pub}|ts=${Date.now()}`;
  const enc = new TextEncoder().encode(msg);
  const sig = await wallet.signMessage(enc);
  const { default: bs58 } = await import('bs58');
  return { 'x-wallet': pub, 'x-msg': msg, 'x-sig': bs58.encode(sig) };
}

export default function AdminPanel() {
  const wallet = useWallet();
  const [authed, setAuthed] = useState(false);
  const [authErr, setAuthErr] = useState<string | null>(null);

  useEffect(() => {
    t('page_view', { scope: 'admin_panel' });
  }, []);

  const { data, mutate } = useSWR(
    () => (authed ? '/api/admin/overview' : null),
    (u) => fetchJSON(u, { credentials: 'include' as any }),
    { refreshInterval: 20_000 }
  );

  async function signIn() {
    setAuthErr(null);
    const hdrs = await signAuthHeaders(wallet as any);
    if (!hdrs) {
      setAuthErr('Connect a wallet that supports message signing.');
      return;
    }
    try {
      const r = await fetch('/api/admin/authz', { headers: hdrs, credentials: 'include' });
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        setAuthed(false);
        setAuthErr(j?.error || 'Forbidden');
        return;
      }
      setAuthed(true);
      mutate();
    } catch (e: any) {
      setAuthErr(e?.message || 'Error');
      setAuthed(false);
    }
  }

  const creators = data?.creators || [];
  const threads = data?.threads || [];
  const messages = data?.messages || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#05060a] via-[#0f172a] to-[#0a0b0e] text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-black/30 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3">
            <img src="/logo-ror-glass.svg" className="h-9 w-9 rounded-2xl border border-white/15" alt="RoR" />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Reply or Refund</div>
              <div className="text-[11px] text-white/40">Admin panel</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <WalletMultiButtonDynamic className="!bg-white !text-black !rounded-xl !h-8 !px-3 !py-0 !text-sm" />
            <button onClick={signIn} className="btn">Admin sign in</button>
          </div>
        </div>
      </header>

      {!authed ? (
        <main className="max-w-3xl mx-auto px-4 py-12">
          <div className="card p-6 space-y-3">
            <div className="text-xl font-bold">Restricted</div>
            <p className="text-sm text-white/60">
              Only whitelisted admin wallets can access this panel. Sign a message to continue.
            </p>
            {authErr && <div className="text-sm text-red-300">{authErr}</div>}
          </div>
        </main>
      ) : (
        <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard label="Creators" value={data?.creatorsCount ?? 0} />
            <MetricCard label="Threads" value={data?.threadsCount ?? 0} />
            <MetricCard label="Messages (loaded)" value={data?.messagesCount ?? 0} />
            <MetricCard label="Admin wallet" value={(wallet.publicKey?.toBase58()?.slice(0, 12) || '') + '…'} muted />
          </div>

          <section className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Creators</div>
                <div className="text-xs text-white/50">Wallet bound + pricing</div>
              </div>
              <div className="text-[11px] text-white/40">Showing {creators.length}</div>
            </div>
            <div className="flex gap-2 text-[11px]">
              <a className="underline text-white/70" href="/api/admin/export?format=csv&type=creators">Download creators CSV</a>
              <a className="underline text-white/70" href="/api/admin/export?format=csv&type=threads">Download threads CSV</a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-white/50 text-xs">
                  <tr>
                    <th className="text-left py-2">Handle</th>
                    <th className="text-left py-2">Wallet</th>
                    <th className="text-left py-2">Email</th>
                    <th className="text-left py-2">Price</th>
                    <th className="text-left py-2">Window</th>
                    <th className="text-left py-2">Ref</th>
                    <th className="text-left py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {creators.map((c: any) => (
                    <tr key={c.handle}>
                      <td className="py-2 font-semibold">@{c.handle}</td>
                      <td className="py-2 text-white/60">{c.wallet?.slice(0, 10) ?? '—'}</td>
                      <td className="py-2 text-white/60">{c.email || '—'}</td>
                      <td className="py-2">€{Number(c.price ?? 0).toFixed(2)}</td>
                      <td className="py-2">{c.replyWindowHours}h</td>
                      <td className="py-2 text-white/60">{c.refCode || '—'}</td>
                      <td className="py-2">
                        <button
                          className={`text-[11px] px-2 py-1 rounded-full border ${c.banned ? 'border-red-400/50 text-red-300' : 'border-emerald-400/50 text-emerald-200'}`}
                          onClick={async () => {
                            try {
                              const hdrs = await signAuthHeaders(wallet as any);
                              if (!hdrs) { setAuthErr('Connect wallet'); return; }
                              await fetch('/api/admin/ban', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', ...hdrs },
                                credentials: 'include',
                                body: JSON.stringify({ handle: c.handle, banned: !c.banned }),
                              });
                              mutate();
                            } catch (e: any) {
                              setAuthErr(e?.message || 'Toggle failed');
                            }
                          }}
                        >
                          {c.banned ? 'Banned' : 'Active'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!creators.length && (
                    <tr><td className="py-3 text-white/40" colSpan={7}>No creators yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Latest threads</div>
                  <div className="text-xs text-white/50">Newest first</div>
                </div>
                <div className="text-[11px] text-white/40">Showing {threads.length}</div>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {threads.map((t: any) => (
                  <div key={t.id} className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between text-sm">
                      <div className="font-semibold">{t.id.slice(0, 10)}…</div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10">{t.status}</span>
                    </div>
                    <div className="text-xs text-white/50 mt-1">
                      creator @{t.creator} · fan {t.fan} · €{Number(t.amount || 0).toFixed(2)} · via {t.paid_via}
                    </div>
                  </div>
                ))}
                {!threads.length && <div className="text-white/40 text-sm">No threads.</div>}
              </div>
            </div>

            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Recent messages</div>
                  <div className="text-xs text-white/50">Limited view</div>
                </div>
                <div className="text-[11px] text-white/40">Showing {messages.length}</div>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {messages.map((m: any) => (
                  <div key={m.id} className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-xs text-white/50 flex items-center justify-between">
                      <span>{m.from} in {m.threadId.slice(0, 8)}…</span>
                      <span className="text-[10px]">{new Date(m.ts).toLocaleString()}</span>
                    </div>
                    <div className="text-sm mt-1">{m.body}</div>
                  </div>
                ))}
                {!messages.length && <div className="text-white/40 text-sm">No messages.</div>}
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

function MetricCard({ label, value, muted }: { label: string; value: any; muted?: boolean }) {
  return (
    <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_10px_50px_rgba(0,0,0,0.35)]">
      <div className="text-xs text-white/50">{label}</div>
      <div className="text-2xl font-bold">{muted ? <span className="text-white/50">{value}</span> : value}</div>
    </div>
  );
}
