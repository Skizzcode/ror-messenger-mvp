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
  const [mounted, setMounted] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [forceRole, setForceRole] = useState<'fan' | null>(null);
  const [ref, setRef] = useState<string | null>(null);

  const creatorHandle = handle;

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href);
      const r = u.searchParams.get('ref');
      if (r) setRef(r);
    }
  }, []);

  const { data, mutate } = useSWR(
    () => (mounted ? `/api/thread?id=${handle}` : null),
    fetcher,
    { refreshInterval: 1500 }
  );

  const thread = data?.thread;
  const messages = data?.messages || [];

  const wallet = useWallet();
  const isConnected = !!wallet.publicKey;
  const walletPk = wallet.publicKey?.toBase58() || null;

  const autoRole: 'fan' | 'creator' = useMemo(() => {
    if (!thread) return 'fan';
    if (walletPk && thread.creator_pubkey && walletPk === thread.creator_pubkey) return 'creator';
    return 'fan';
  }, [thread, walletPk]);

  const canActAsFan =
    walletPk &&
    thread?.creator_pubkey &&
    walletPk === thread.creator_pubkey &&
    walletPk !== thread.fan_pubkey;

  const role: 'fan' | 'creator' = forceRole ?? autoRole;

  const canSend = isConnected && text.trim().length > 0 && !sending;

  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, mounted]);

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

  const timeLeft = useMemo(() => {
    if (!mounted || !thread) return null;
    const ms = Math.max(0, thread.deadline - Date.now());
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }, [thread, mounted, data]);

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
      if (!thread) {
        const signed = await signCreateThread(wallet as any, {
          creator: creatorHandle,
          fanPubkey: wallet.publicKey!.toBase58(),
          firstMessage: text,
          ttlHours: 48,
        });

        const r = await fetch('/api/create-thread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creator: creatorHandle,
            fan: wallet.publicKey!.toBase58(),
            amount: 20,
            ttlHours: 48,
            firstMessage: text,
            fanPubkey: wallet.publicKey!.toBase58(),
            creatorPubkey: null,
            ref,
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
      alert(e?.message || 'Error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/70 backdrop-blur border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/logo-ror-glass.svg"
              alt="RoR"
              className="h-8 w-8 rounded-2xl border border-white/10"
            />
            <div>
              <div className="text-sm font-semibold">
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
                className="text-[10px] px-3 py-1 rounded-full bg-white/5 hover:bg-white/10"
              >
                {forceRole === 'fan' ? 'Back to creator' : 'Test as fan'}
              </button>
            )}
            {mounted && lastTx && (
              <span className="text-[10px] px-3 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/30">
                escrow: {lastTx.slice(0, 8)}…
              </span>
            )}
            {mounted && (
              <WalletMultiButton className="!bg-white !text-black !rounded-xl !h-8 !px-4 !py-0 !text-sm" />
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 flex gap-6">
        {/* Chat */}
        <div className="flex-1 flex flex-col bg-white/5 border border-white/5 rounded-3xl backdrop-blur-sm min-h-[65vh] overflow-hidden">
          {/* Stripe bind */}
          {mounted && thread?.paid_via === 'stripe' && !thread?.fan_pubkey && role === 'fan' && (
            <div className="px-4 py-3 text-xs bg-yellow-400/10 border-b border-yellow-400/20 flex items-center justify-between gap-2">
              <span>Bind this chat to your wallet.</span>
              <button
                className="bg-white text-black text-[10px] px-3 py-1 rounded-lg"
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
                Bind
              </button>
            </div>
          )}

          {/* Messages */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto space-y-3 px-4 py-4"
          >
            {messages.map((m: any) => (
              <div
                key={m.id}
                className={
                  'max-w-[75%] px-4 py-2 rounded-2xl text-sm leading-relaxed ' +
                  (m.from === 'fan'
                    ? 'bg-white text-black rounded-bl-md'
                    : 'bg-slate-900/70 border border-white/10 rounded-br-md ml-auto')
                }
              >
                <div className="text-[10px] uppercase tracking-wide opacity-40 mb-1">
                  {m.from === 'fan' ? 'Fan' : 'Creator'}
                </div>
                <div>{m.body}</div>
              </div>
            ))}
            {!messages.length && (
              <div className="text-sm text-white/30 text-center py-6">
                No messages yet — start the conversation.
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-white/5 space-y-2">
            {!isConnected && role === 'fan' && (
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
                      creator: creatorHandle,
                      amount: 20,
                      ttlHours: 48,
                      firstMessage: text,
                      ...(ref ? { ref } : {}),
                    }),
                  });
                  const j = await r.json();
                  if (j?.url) window.location.href = j.url;
                }}
                className="bg-white text-black text-xs px-3 py-1.5 rounded-lg"
              >
                Pay with card
              </button>
            )}

            <textarea
              className="w-full bg-black/25 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-40"
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
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={send}
                disabled={!canSend}
                className="bg-white text-black text-sm px-4 py-1.5 rounded-xl disabled:opacity-40"
              >
                {sending ? 'Sending…' : role === 'creator' ? 'Send reply' : 'Send & lock'}
              </button>
              <span className="text-[10px] text-white/35">
                {role === 'creator'
                  ? 'First good reply releases escrow.'
                  : 'Enter = send (desktop)'}
              </span>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="w-56 hidden lg:flex flex-col gap-3">
          <div className="card p-3">
            <div className="text-xs text-white/50 mb-1">About</div>
            <div className="text-sm font-medium">{creatorHandle}</div>
            {thread ? (
              <div className="text-[11px] text-white/30 mt-1">
                amount: {thread.amount ?? 20} · status: {thread.status}
              </div>
            ) : (
              <div className="text-[11px] text-white/30 mt-1">New chat will be created.</div>
            )}
          </div>
          {thread?.ref && (
            <div className="card p-3 text-[11px]">
              <div className="text-xs text-white/50 mb-1">Ref</div>
              <div className="break-all">{thread.ref}</div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export async function getServerSideProps(ctx: any) {
  return { props: { handle: ctx.params.slug } };
}
