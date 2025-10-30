// pages/c/[slug].tsx
import useSWR from 'swr';
import { useState, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import { signCreateThread, signMessagePayload, signBindFan } from '../../lib/sign';
import { clientInitEscrow } from '../../lib/escrowClient';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ChatPage({ handle }: { handle: string }) {
  // UI state
  const [mounted, setMounted] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [forceRole, setForceRole] = useState<'fan' | null>(null);
  const [ref, setRef] = useState<string | null>(null);

  // 👇 slug merken → wird beim Create benutzt
  const creatorHandle = handle;

  // on mount
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href);
      const r = u.searchParams.get('ref');
      if (r) setRef(r);
    }
  }, []);

  // thread + messages holen
  const { data, mutate } = useSWR(
    () => (mounted ? `/api/thread?id=${handle}` : null),
    fetcher,
    { refreshInterval: 1500 }
  );

  const thread = data?.thread;
  const messages = data?.messages || [];

  // wallet
  const wallet = useWallet();
  const isConnected = !!wallet.publicKey;
  const walletPk = wallet.publicKey?.toBase58() || null;

  // auto-role bestimmen
  const autoRole: 'fan' | 'creator' = useMemo(() => {
    if (!thread) return 'fan';
    if (walletPk && thread.creator_pubkey && walletPk === thread.creator_pubkey) return 'creator';
    return 'fan';
  }, [thread, walletPk]);

  // creator darf testweise als fan
  const canActAsFan =
    walletPk &&
    thread?.creator_pubkey &&
    walletPk === thread.creator_pubkey &&
    walletPk !== thread.fan_pubkey;

  // finale rolle
  const role: 'fan' | 'creator' = forceRole ?? autoRole;

  const canSend = isConnected && text.trim().length > 0 && !sending;

  // scroll ans ende
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, mounted]);

  // escrow nur für fans
  const escrowTried = useRef(false);
  useEffect(() => {
    if (!mounted) return;
    const canSignTx = (wallet as any)?.signTransaction;
    if (thread && role === 'fan' && wallet.publicKey && canSignTx && !escrowTried.current) {
      escrowTried.current = true;
      clientInitEscrow({
        threadId: thread.id,
        amountUSDC: thread.amount || 20,
        payer: wallet.publicKey,
        wallet: wallet as any,
      })
        .then((r) => setLastTx(r.tx))
        .catch(console.error);
    }
  }, [thread, role, wallet.publicKey, mounted]);

  // countdown
  const timeLeft = useMemo(() => {
    if (!mounted || !thread) return null;
    const ms = Math.max(0, thread.deadline - Date.now());
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }, [thread, mounted, data]);

  // senden
  async function send() {
    if (!text.trim() || sending) return;
    if (!isConnected) {
      alert('Connect your wallet first.');
      return;
    }
    const canSign = (wallet as any)?.signMessage;
    if (!canSign) {
      alert('Your wallet must support message signing.');
      return;
    }

    setSending(true);
    try {
      // 🆕 KEIN THREAD → Fan startet Konversation
      if (!thread) {
        const signed = await signCreateThread(wallet as any, {
          creator: creatorHandle, // 👈 jetzt slug
          fanPubkey: wallet.publicKey!.toBase58(),
          firstMessage: text,
          ttlHours: 48,
        });

        const r = await fetch('/api/create-thread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creator: creatorHandle,                 // 👈 kein 'creator-demo'
            fan: wallet.publicKey!.toBase58(),      // 👈 kein 'fan-demo'
            amount: 20,
            ttlHours: 48,
            firstMessage: text,
            fanPubkey: wallet.publicKey!.toBase58(),
            creatorPubkey: null,
            ref,                                    // 👈 aus URL
            sigBase58: signed.sigBase58,
            msg: signed.msg,
            pubkeyBase58: signed.pubkeyBase58,
          }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'Failed to create thread');
        if (typeof window !== 'undefined') window.location.href = `/c/${j.threadId}`;
        return;
      }

      // ✅ THREAD EXISTIERT → ganz normal message schicken
      const signed = await signMessagePayload(wallet as any, {
        threadId: thread.id,
        from: role,
        body: text,
      });

      const r = await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: thread.id,
          from: role,
          body: text,
          sigBase58: signed.sigBase58,
          msg: signed.msg,
          pubkeyBase58: signed.pubkeyBase58,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Failed to send');

      setText('');
      mutate();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-white flex flex-col">
      {/* HEADER */}
      <header className="sticky top-0 z-20 bg-black/20 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/logo-ror-glass.svg"
              alt="RoR"
              className="h-8 w-8 rounded-2xl border border-white/10 shadow-sm"
            />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">
                {thread ? 'RoR Chat' : `Chat with ${creatorHandle}`}
              </div>
              <div className="text-[10px] text-white/40">
                {thread ? `Time left: ${timeLeft || '—'}` : 'New conversation'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canActAsFan && (
              <button
                onClick={() => setForceRole((r) => (r ? null : 'fan'))}
                className="text-[10px] px-2 py-1 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
              >
                {forceRole === 'fan' ? 'Back to creator' : 'Test as fan'}
              </button>
            )}
            {mounted && lastTx && (
              <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/30 text-emerald-50">
                escrow: {lastTx.slice(0, 8)}…
              </span>
            )}
            {mounted && (
              <WalletMultiButton className="!bg-white !text-black !rounded-2xl !h-8 !px-3 !py-0 !text-sm !shadow" />
            )}
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 flex flex-col gap-3">
        <div className="rounded-3xl bg-white/[0.03] border border-white/[0.04] backdrop-blur-xl flex flex-col gap-3 p-4 min-h-[60vh] shadow-[0_12px_60px_rgba(0,0,0,0.25)]">
          {/* Stripe → bind (mit Creator-Namen) */}
          {mounted && thread?.paid_via === 'stripe' && !thread?.fan_pubkey && role === 'fan' && (
            <div className="p-3 rounded-2xl bg-yellow-400/10 border border-yellow-400/30 text-sm flex items-center justify-between gap-3">
              <span className="text-xs md:text-sm">
                Bind {creatorHandle} chat to your wallet.
              </span>
              <button
                className="bg-white text-black text-xs px-3 py-1 rounded-xl"
                onClick={async () => {
                  if (!wallet.publicKey) {
                    alert('Connect wallet first');
                    return;
                  }
                  try {
                    const signed = await signBindFan(wallet as any, { threadId: thread.id });
                    const r = await fetch('/api/thread/bind-fan', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        threadId: thread.id,
                        ...signed,
                      }),
                    });
                    const j = await r.json();
                    if (!r.ok) throw new Error(j?.error || 'Bind failed');
                    mutate();
                  } catch (e: any) {
                    alert(e?.message || 'Error');
                  }
                }}
              >
                Bind now
              </button>
            </div>
          )}

          {/* MESSAGES */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-white/10"
          >
            {messages.map((m: any) => (
              <div
                key={m.id}
                className={
                  'max-w-[78%] px-4 py-2 rounded-2xl shadow-sm ' +
                  (m.from === 'fan'
                    ? 'bg-white text-black rounded-bl-md'
                    : 'bg-[#111827]/90 border border-white/5 rounded-br-md ml-auto')
                }
              >
                <div className="text-[10px] uppercase tracking-wide opacity-40 mb-1">
                  {m.from === 'fan' ? 'Fan' : 'Creator'}
                </div>
                <div className="text-sm leading-relaxed">{m.body}</div>
              </div>
            ))}
            {!messages.length && (
              <div className="text-sm text-white/25 text-center py-6">
                No messages yet — start the conversation.
              </div>
            )}
          </div>

          {/* INPUT */}
          <div className="space-y-2">
            {/* Pay with card – nur Fan, nur ohne Wallet */}
            {!isConnected && role === 'fan' && (
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!text.trim()) {
                      alert('Type your first message first.');
                      return;
                    }
                    const r = await fetch('/api/checkout/create', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        creator: creatorHandle, // 👈 kein 'creator-demo'
                        amount: 20,
                        ttlHours: 48,
                        firstMessage: text,
                        ...(ref ? { ref } : {}),
                      }),
                    });
                    const j = await r.json();
                    if (j?.url) window.location.href = j.url;
                  }}
                  className="bg-white text-black text-sm px-4 py-2 rounded-2xl shadow-sm"
                >
                  Pay with card
                </button>
              </div>
            )}

            <textarea
              className="w-full bg-black/30 border border-white/5 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/15 disabled:opacity-40"
              placeholder={role === 'creator' ? 'Write your reply…' : 'Write your message…'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                const isMobile =
                  typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);
                if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
                  e.preventDefault();
                  if (canSend) send();
                }
              }}
              disabled={!isConnected}
            />
            <div className="flex items-center gap-2 justify-between">
              <button
                onClick={send}
                className="bg-white text-black text-sm px-5 py-2 rounded-2xl disabled:opacity-40 shadow-sm"
                disabled={!canSend}
              >
                {sending ? 'Sending…' : role === 'creator' ? 'Send reply' : 'Send & lock'}
              </button>
              <span className="text-[11px] text-white/35">
                {role === 'creator'
                  ? 'First good reply releases escrow.'
                  : 'Enter = send (desktop)'}
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export async function getServerSideProps(ctx: any) {
  return { props: { handle: ctx.params.slug } };
}
