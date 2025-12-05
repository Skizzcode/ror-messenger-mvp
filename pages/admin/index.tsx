// pages/admin/index.tsx
import useSWR from 'swr';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);

  const { data, mutate } = useSWR(
    () => (authed ? '/api/admin/overview' : null),
    (u) => fetchJSON(u, { credentials: 'include' as any }),
    { refreshInterval: 20_000 }
  );
  const { data: auditData } = useSWR(
    () => (authed ? '/api/admin/audit?limit=120' : null),
    (u) => fetchJSON(u, { credentials: 'include' as any }),
    { refreshInterval: 15_000 }
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
      <header className="sticky top-0 z-30 bg-black/30 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3">
            <img src="/logo-ror-glass.svg" className="h-9 w-9 rounded-2xl " alt="RoR" />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Reply or Refund</div>
              <div className="text-[11px] text-white/40">Admin panel · audit & trust</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <WalletMultiButtonDynamic className="!bg-white !text-black !rounded-xl !h-8 !px-3 !py-0 !text-sm" />
            <button onClick={signIn} className="btn">
              {authed ? 'Signed in' : 'Admin sign in'}
            </button>
          </div>
        </div>
      </header>

      {/* Trust strip */}
      <section className="bg-gradient-to-r from-emerald-400/10 via-white/5 to-cyan-400/10 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-2 text-[11px] text-white/70">
          <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">Audit log: flag/archive</span>
          <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">Admin wallets only</span>
          <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">Encrypted session</span>
        </div>
      </section>

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
                <div className="text-sm font-semibold">Audit log</div>
                <div className="text-xs text-white/50">Latest admin actions (flag/archive/report)</div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-white/60">
                <a className="underline" href="/api/admin/audit?limit=500">Download JSON</a>
                <a className="underline" href="/api/admin/export?format=csv&type=audit">Download CSV</a>
                <a className="underline" href="/api/admin/export?format=csv&type=invoices">Invoices CSV</a>
              </div>
            </div>
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {(auditData?.entries || []).slice().reverse().map((ev: any, idx: number) => (
                <div key={`${ev.ts}-${idx}`} className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-xs text-white/60 flex items-center justify-between gap-2">
                    <span className="font-semibold">{ev.kind}</span>
                    <span>{new Date(ev.ts).toLocaleString()}</span>
                  </div>
                  <div className="text-[11px] text-white/50 mt-1 flex items-center justify-between gap-2">
                    <span className="truncate">
                      Actor: {ev.actor}
                      {ev.detail?.reviewedBy ? ` · Reviewed by: ${ev.detail.reviewedBy}` : ''}
                    </span>
                    <button
                      className="px-2 py-1 rounded-full bg-white/10 hover:bg-white/20"
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(ev.detail || {}, null, 2));
                        setToast('Copied detail');
                        setTimeout(() => setToast(null), 1200);
                      }}
                    >
                      Copy detail
                    </button>
                  </div>
                  {ev.detail && (
                    <div className="text-[11px] text-white/65 mt-2 bg-black/30 border border-white/10 rounded-lg px-2 py-1 whitespace-pre-wrap break-all">
                      {Object.entries(ev.detail).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ')}
                    </div>
                  )}
                </div>
              ))}
              {!auditData?.entries?.length && (
                <div className="text-sm text-white/40">No audit entries yet.</div>
              )}
            </div>
          </section>

          <section className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Creators</div>
                <div className="text-xs text-white/50">Wallet bound + pricing</div>
              </div>
              <div className="text-[11px] text-white/40">Showing {creators.length}</div>
            </div>
            <div className="flex gap-2 text-[11px] text-white/70">
              <a className="underline" href="/api/admin/export?format=csv&type=creators">Download creators CSV</a>
              <a className="underline" href="/api/admin/export?format=csv&type=threads">Download threads CSV</a>
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
                    <th className="text-left py-2">Msgs</th>
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
                      <td className="py-2 text-[11px]">
                        {c.banned ? (
                          <span className="px-2 py-1 rounded-full border border-red-400/50 text-red-300">Banned</span>
                        ) : (
                          <span className="px-2 py-1 rounded-full border border-emerald-400/50 text-emerald-200">Active</span>
                        )}
                      </td>
                      <td className="py-2">
                        <button
                          className="text-[11px] px-2 py-1 rounded-full bg-white/10 hover:bg-white/20"
                          onClick={() => setExpanded((prev) => ({ ...prev, [c.handle]: !prev[c.handle] }))}
                        >
                          {expanded[c.handle] ? 'Hide' : 'Show'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!creators.length && (
                    <tr><td className="py-3 text-white/40" colSpan={8}>No creators yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="card p-4 space-y-3">
              <div className="text-sm font-semibold">Creator messages</div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {creators.map((c: any) => {
                  const creatorThreads = threads.filter((t: any) => t.creator === c.handle);
                  const creatorMsgs = messages.filter((m: any) =>
                    creatorThreads.some((t: any) => t.id === m.threadId)
                  );
                  const isOpen = expanded[c.handle];
                  return (
                    <div key={c.handle} className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2 relative overflow-hidden">
                      {!isOpen && (
                        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center text-[11px] text-white/70 pointer-events-none">
                          Click “Show” to reveal messages
                        </div>
                      )}
                      <div className="flex items-center justify-between relative z-10">
                        <div className="font-semibold">@{c.handle}</div>
                        <button
                          className="text-[11px] px-2 py-1 rounded-full bg-white/10 hover:bg-white/20"
                          onClick={() => setExpanded((prev) => ({ ...prev, [c.handle]: !prev[c.handle] }))}
                        >
                          {isOpen ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <div className={`space-y-1 relative z-10 ${isOpen ? '' : 'opacity-40 blur-[1px]'}`}>
                        {creatorMsgs.slice(0, 6).map((m: any) => (
                          <div key={m.id} className="text-xs bg-black/30 rounded-lg px-2 py-1 flex items-center justify-between gap-2">
                            <div>
                              <span className="text-white/60 mr-1">{m.from}:</span>
                              <span>{m.body}</span>
                            </div>
                            {isOpen && (
                              <button
                                className="text-[10px] px-2 py-1 rounded-full bg-red-400/15 border border-red-400/40"
                                onClick={async () => {
                                  try {
                                    const hdrs = await signAuthHeaders(wallet as any);
                                    if (!hdrs) { setAuthErr('Connect wallet'); return; }
                                    await fetch('/api/admin/flag-message', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', ...hdrs },
                                      credentials: 'include',
                                      body: JSON.stringify({
                                        threadId: m.threadId,
                                        messageId: m.id,
                                        reason: 'admin_flag',
                                        archive: true,
                                      }),
                                    });
                                    setToast('Flagged + archived.');
                                    setTimeout(() => setToast(null), 1600);
                                    mutate();
                                  } catch (e: any) {
                                    setAuthErr(e?.message || 'Flag failed');
                                  }
                                }}
                              >
                                Flag+Archive
                              </button>
                            )}
                          </div>
                        ))}
                        {!creatorMsgs.length && (
                          <div className="text-xs text-white/40">No messages yet.</div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {!creators.length && <div className="text-white/40 text-sm">No creators.</div>}
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

      {toast && (
        <div className="fixed bottom-4 right-4 px-4 py-2 rounded-xl bg-white text-black text-sm shadow-lg border border-black/5">
          {toast}
        </div>
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
