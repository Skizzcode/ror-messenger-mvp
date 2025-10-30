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

  // thread/messages
  const { data, mutate } = useSWR(
    () => (mounted ? `/api/thread?id=${handle}` : null),
    fetcher,
    { refreshInterval: 1500 }
  );
  const thread = data?.thread;
  const messages = data?.messages || [];
  const creatorProfile = data?.creatorProfile || null;

  // wenn es noch keinen Thread gibt → extra die creator-settings holen, damit wir den Preis kennen
  const { data: creatorSettings } = useSWR(
    () => (mounted && !thread ? `/api/creator-settings?handle=${creatorHandle}` : null),
    fetcher
  );
  const creatorPrice = useMemo(
    () => Math.max(1, Number(creatorSettings?.price ?? 20)),
    [creatorSettings]
  );

  // Wallet
  const wallet = useWallet();
  const isConnected = !!wallet.publicKey;
  const walletPk = wallet.publicKey?.toBase58() || null;

  // Rolle automatisch bestimmen
  const autoRole: 'fan' | 'creator' = useMemo(() => {
    if (!thread) return 'fan';
    if (walletPk && thread.creator_pubkey && walletPk === thread.creator_pubkey) return 'creator';
    return 'fan';
  }, [thread, walletPk]);

  // Creator darf testweise als Fan
  const canActAsFan =
    walletPk &&
    thread?.creator_pubkey &&
    walletPk === thread.creator_pubkey &&
    walletPk !== thread.fan_pubkey;

  // endgültige Rolle
  const role: 'fan' | 'creator' = forceRole ?? autoRole;

  const canSend = isConnected && text.trim().length > 0 && !sending;

  // Scroll nach unten
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, mounted]);

  // Escrow für Fans
  const escrowTried = useRef(false);
  useEffect(() => {
    if (!mounted) return;
    const canSignTx = (wallet as any)?.signTransaction;
    if (thread && role === 'fan' && wallet.publicKey && canSignTx && !escrowTried.current) {
      escrowTried.current = true;
      clientInitEscrow({
        threadId: thread.id,
        amountUSDC: thread.amount || creatorPrice,
        payer: wallet.publicKey,
        wallet: wallet as any,
      })
        .then((r) => setLastTx(r.tx))
        .catch(console.error);
    }
  }, [thread, role, wallet.publicKey, mounted, creatorPrice]);

  // Countdown
  const timeLeft = useMemo(() => {
    if (!mounted || !thread) return null;
    const ms = Math.max(0, thread.deadline - Date.now());
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }, [thread, mounted, data]);

  // 🆕 Name / Avatar sauber ableiten
  const displayName =
    creatorProfile?.displayName ||
    thread?.creator_display_name ||
    (thread ? `@${thread.creator}` : `Chat with ${creatorHandle}`);

  const avatarSrc =
    creatorProfile?.avatarDataUrl ||
    thread?.creator_avatar ||
    '/logo-ror-glass.svg';

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
      // kein Thread → erstellen (Server nimmt Creator-Preis)
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

      // Thread existiert → Nachricht
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
      {/* HEADER */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={avatarSrc}
              alt={displayName}
              className="h-11 w-11 rounded-2xl border border-white/10 object-cover"
            />
            <div>
              <div className="text-sm font-semibold tracking-tight">{displayName}</div>
              <div className="text-[10px] text-white/40">
                {thread ? `Time left: ${timeLeft || '—'}` : 'New conversation'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!thread && (
              <span className="text-[11px] px-2 py-1 rounded-full bg-white/10 border border-white/15">
                €{creatorPrice}
              </span>
            )}
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

      {/* MAIN */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-5 flex flex-col gap-4">
        <div className="flex-1 bg-white/5 border border-white/5 rounded-3xl backdrop-blur-sm flex flex-col min-h-[65vh]">
          {/* STRIPE BIND */}
          {mounted && thread?.paid_via === 'stripe' && !thread?.fan_pubkey && role === 'fan' && (
            <div className="px-4 py-3 text-xs bg-yellow-400/10 border-b border-yellow-400/20 flex items-center justify-between gap-2 rounded-t-3xl">
              <span className="text-white/80">Bind this chat to your wallet.</span>
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

          {/* MESSAGES */}
          <div ref={listRef} className="flex-1 overflow-y-auto space-y-3 px-4 py-4">
            {messages.map((m: any) => (
              <div
                key={m.id}
                className={
                  'max-w-[78%] px-4 py-2 rounded-2xl text-sm leading-relaxed ' +
                  (m.from === 'fan'
                    ? 'bg-white text-black rounded-bl-md'
                    : 'bg-slate-900/80 border border-white/10 rounded-br-md ml-auto')
                }
              >
                <div className="text-[10px] uppercase tracking-wide opacity-40 mb-1">
                  {m.from === 'fan' ? 'Fan' : displayName}
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

          {/* INPUT */}
          <div className="px-4 py-3 border-t border-white/5 space-y-2 rounded-b-3xl">
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
                Pay with card (€{creatorPrice})
              </button>
            )}

            <textarea
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-40"
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
              {role === 'fan' ? (
                <span className="text-[10px] text-white/35">Enter = send (desktop)</span>
              ) : (
                <span className="text-[10px] text-white/35">First good reply releases escrow.</span>
              )}
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
