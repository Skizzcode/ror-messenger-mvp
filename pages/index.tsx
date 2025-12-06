// pages/index.tsx
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { t } from '../lib/telemetry';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

type HomeProps = { refCode: string | null };

export default function Home({ refCode }: HomeProps) {
  const wallet = useWallet();
  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(false);
  const [myCreator, setMyCreator] = useState<null | {
    handle: string;
    displayName: string;
    avatarDataUrl: string | null;
  }>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [heroPrice, setHeroPrice] = useState<number>(20);
  const [heroHandle, setHeroHandle] = useState<string>('creator');
  const [heroSlaHours, setHeroSlaHours] = useState<number>(48);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    t('page_view', { scope: 'public_home' });
  }, []);

  // Persist theme preference across reloads
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('ror_theme');
    if (stored === 'dark' || stored === 'light') {
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;
    window.localStorage.setItem('ror_theme', theme);
  }, [theme, mounted]);

  useEffect(() => {
    let stop = false;
    async function run() {
      if (!wallet.publicKey) {
        setMyCreator(null);
        return;
      }
      setChecking(true);
      try {
        const pk = wallet.publicKey.toBase58();
        const r = await fetch(`/api/creator-by-wallet?wallet=${encodeURIComponent(pk)}`);
        const j = await r.json();
        if (!stop) {
          setMyCreator(
            j?.ok
              ? {
                  handle: j.handle,
                  displayName: j.displayName,
                  avatarDataUrl: j.avatarDataUrl || null,
                }
              : null
          );
          if (j?.ok && j.handle) {
            t('dashboard_view', { scope: 'creator', handle: j.handle });
          }
        }
      } catch {
        if (!stop) setMyCreator(null);
      } finally {
        if (!stop) setChecking(false);
      }
    }
    run();
    return () => {
      stop = true;
    };
  }, [wallet.publicKey]);

  // Pull the creator's public price to display on the hero card
  useEffect(() => {
    const h = myCreator?.handle;
    if (!h) {
      setHeroHandle('creator');
      setHeroPrice(20);
      setHeroSlaHours(48);
      return;
    }
    setHeroHandle(h);
    fetch(`/api/thread?id=${encodeURIComponent(h)}`)
      .then((r) => r.json())
      .then((j) => {
        const p = j?.creatorProfile?.price;
        const sla = j?.creatorProfile?.replyWindowHours;
        if (typeof p === 'number' && p > 0) setHeroPrice(p);
        if (typeof sla === 'number' && sla > 0) setHeroSlaHours(sla);
      })
      .catch(() => {
        // keep defaults
      });
  }, [myCreator?.handle]);

  const chatDemoUrl = '/c/creator-demo';
  const joinUrl = refCode ? `/creator/join?ref=${encodeURIComponent(refCode)}` : '/creator/join';

  const isLight = theme === 'light';
  const shell = isLight
    ? 'bg-gradient-to-br from-[#f9fbff] via-white to-[#e5edff] text-[#0b1420]'
    : 'bg-gradient-to-br from-[#05060d] via-[#0c1224] to-[#05070f] text-white';
  const panel = isLight
    ? 'bg-white/80 border border-black/5 shadow-[0_30px_120px_rgba(10,16,32,0.12)]'
    : 'bg-white/5 border border-white/10 shadow-[0_30px_120px_rgba(0,0,0,0.45)]';
  const subtext = isLight ? 'text-slate-600' : 'text-white/60';
  const accentBtn =
    'bg-gradient-to-r from-[#b1e0ff] via-[#a3f0e0] to-[#d9e7ff] text-[#0b1424] shadow-lg hover:shadow-xl hover:-translate-y-[1px] transition';
  const ghostBtn =
    isLight
      ? 'inline-flex items-center gap-2 px-4 py-2 rounded-full border border-black/10 text-sm hover:bg-black/5'
      : 'inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/15 text-sm hover:bg-white/5';
  const chipBase = 'px-3 py-1 rounded-full text-[11px] border shadow-sm';

  return (
    <div className={`min-h-screen flex flex-col relative overflow-hidden ${shell}`}>
      <div className="pointer-events-none absolute -top-32 -left-16 h-96 w-96 bg-[#a6d9ff]/40 blur-3xl" />
      <div className="pointer-events-none absolute top-10 right-[-8rem] h-80 w-80 bg-[#9cf7e8]/30 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.09] bg-[radial-gradient(circle_at_20%_20%,#ffffff,transparent_26%),radial-gradient(circle_at_80%_0%,#9cf7e8,transparent_20%)]" />

      {/* HEADER */}
      <header className={`w-full border-b ${isLight ? 'border-black/5 bg-white/70' : 'border-white/10 bg-[#05060d]/70'} backdrop-blur sticky top-0 z-30`}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="/logo-ror-glass.svg"
              alt="RoR"
              className="h-14 w-14 rounded-3xl shadow-xl"
            />
            <div className="leading-tight">
              <div className="text-base font-semibold tracking-tight">Reply or Refund</div>
              <div className={`text-[11px] ${subtext}`}>Guaranteed DMs, escrowed.</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <button
              className={`text-xs px-3 py-1 rounded-full border ${isLight ? 'border-black/10 hover:bg-black/5' : 'border-white/15 hover:bg-white/10'}`}
              onClick={() => setTheme((p) => (p === 'light' ? 'dark' : 'light'))}
            >
              {isLight ? 'Switch to Dark' : 'Switch to Light'}
            </button>
            {mounted && wallet.publicKey && myCreator?.handle && (
              <Link
                href={`/creator/${myCreator.handle}`}
                className="text-sm px-3 py-1.5 rounded-full bg-black text-white"
                onClick={() => t('cta_click', { scope: 'public_home', props: { cta: 'go_dashboard' } })}
              >
                Go to my dashboard
              </Link>
            )}
            {mounted && (
              <WalletMultiButton className={`${isLight ? '!bg-black !text-white' : '!bg-white !text-black'} !rounded-xl !h-8 !px-3 !py-0 !text-sm`} />
            )}
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1">
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="max-w-6xl mx-auto px-4 py-14 grid gap-10 lg:grid-cols-2 items-center relative z-10">
            <div className="space-y-7">
              <span className={`${chipBase} ${isLight ? 'bg-white/80 border-black/5 text-slate-700' : 'bg-white/10 border-white/20 text-white/85'}`}>
                Pay to DM · reply or refund
              </span>

              <h1 className="text-4xl md:text-5xl font-black leading-tight tracking-tight">
                Guaranteed DMs with escrow protection.
              </h1>

              <p className={`${subtext} text-base max-w-xl`}>
                Fans pay once, your timer starts. Funds sit in escrow until you answer; miss the window and it auto-refunds. Simple, upfront, and trustable for both sides.
              </p>

              <div className="flex flex-wrap gap-3">
                {!mounted || !wallet.publicKey || !myCreator?.handle ? (
                  <>
                    <Link
                      href={joinUrl}
                      className={`btn ${isLight ? '!bg-black !text-white' : ''}`}
                      onClick={() => t('cta_click', { scope: 'public_home', props: { cta: 'join_creator' } })}
                    >
                      Claim my handle
                    </Link>
                    <Link
                      href={chatDemoUrl}
                      className={ghostBtn}
                      onClick={() => t('cta_click', { scope: 'public_home', props: { cta: 'demo_chat' } })}
                    >
                      See a live chat
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href={`/creator/${myCreator.handle}`}
                      className={`btn ${isLight ? '!bg-black !text-white' : ''}`}
                      onClick={() => t('cta_click', { scope: 'public_home', props: { cta: 'go_dashboard' } })}
                    >
                      Go to my dashboard
                    </Link>
                    <Link
                      href={`/c/${myCreator.handle}`}
                      className={ghostBtn}
                      onClick={() => t('cta_click', { scope: 'public_home', props: { cta: 'share_chat_link' } })}
                    >
                      Share my chat
                    </Link>
                  </>
                )}
              </div>

              <div className="flex flex-wrap gap-3 text-[12px]">
                <span className={`${chipBase} ${isLight ? 'bg-white/80 border-black/5 text-slate-700' : 'bg-white/10 border-white/20 text-white/85'}`}>Escrowed until reply</span>
                <span className={`${chipBase} ${isLight ? 'bg-[#e5f0ff] border-[#cddffb] text-[#0b1424]' : 'bg-white/10 border-white/20 text-white/85'}`}>Auto-refund on SLA miss</span>
                <span className={`${chipBase} ${isLight ? 'bg-white/80 border-black/5 text-slate-700' : 'bg-white/10 border-white/20 text-white/85'}`}>Card + wallet</span>
              </div>

              {mounted && wallet.publicKey && !myCreator?.handle && (
                <div className={`text-[11px] ${subtext}`}>
                  {checking ? 'Checking your wallet...' : (
                    <>
                      No creator inbox bound to this wallet.{' '}
                      <Link
                        className="underline"
                        href={joinUrl}
                        onClick={() => t('cta_click', { scope: 'public_home', props: { cta: 'join_from_hint' } })}
                      >
                        Create one
                      </Link>.
                    </>
                  )}
                </div>
              )}
            </div>

            <div className={`${panel} rounded-3xl p-5 md:p-6 space-y-4 relative overflow-hidden`}>
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-[#b1e0ff]/40 via-transparent to-[#a3f0e0]/40" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img src="/logo-ror-glass.svg" alt="RoR" className="h-12 w-12 rounded-3xl" />
                  <div>
                    <div className="text-sm font-semibold">Chat with @{heroHandle}</div>
                    <div className={`${subtext} text-[11px]`}>
                      {`${String(Math.max(0, heroSlaHours)).padStart(2, '0')}:00:00`} · escrow locked
                    </div>
                  </div>
                </div>
                <span className={`${chipBase} ${isLight ? 'bg-white border-black/5 text-slate-800' : 'bg-white/10 border-white/20 text-white/85'}`}>
                  EUR {heroPrice.toFixed(2)}
                </span>
              </div>
              <div className="relative space-y-2 text-sm">
                <div className={`${isLight ? 'bg-white text-black' : 'bg-white text-black'} rounded-2xl rounded-bl-md px-3 py-2 shadow-sm max-w-[78%]`}>
                  Hey, quick question about your drop
                </div>
                <div className={`${isLight ? 'bg-[#0f172a]/5 text-[#0b1420]' : 'bg-[#0f172a]/90 text-white border border-white/10'} rounded-2xl rounded-br-md px-3 py-2 ml-auto shadow-sm max-w-[78%]`}>
                  Thanks for reaching out - what do you want to know exactly?
                </div>
                <div className={`${subtext} text-[11px] mt-3`}>Flow: Paid → Escrow → Reply → Release/Refund</div>
              </div>
              <div className="pt-3 mt-2 border-t border-white/10 grid gap-2 md:grid-cols-2">
                <MiniCard title="No spam" text="Every DM is paid, signal over noise." isLight={isLight} />
                <MiniCard title="Fair by default" text="Fans see SLA + refund guarantee." isLight={isLight} />
              </div>
            </div>
          </div>
        </section>

        {/* FLOW */}
        <section className="max-w-6xl mx-auto px-4 py-10 space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold">Three steps to premium DMs</h2>
              <p className={`${subtext} text-sm`}>Claim, share one link, reply within your SLA. Auto-refund keeps trust high.</p>
            </div>
            <div className="flex gap-2 text-[11px]">
              <span className={`${chipBase} ${isLight ? 'bg-white/80 border-black/5 text-slate-700' : 'bg-white/10 border-white/20 text-white/85'}`}>Built in Germany</span>
              <span className={`${chipBase} ${isLight ? 'bg-white/80 border-black/5 text-slate-700' : 'bg-white/10 border-white/20 text-white/85'}`}>Audit logged</span>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <FeatureCard
              step="1"
              title="Claim & price"
              text="Pick your handle, set price and reply window."
              isLight={isLight}
            />
            <FeatureCard
              step="2"
              title="Share one link"
              text="Fans pay via card or wallet. First message goes to your inbox, escrow locks instantly."
              isLight={isLight}
            />
            <FeatureCard
              step="3"
              title="Reply to unlock"
              text="Your reply releases funds. Miss the timer? Auto-refund triggers." isLight={isLight}
            />
          </div>
        </section>

        {/* CTA STRIP */}
        <section className={`${isLight ? 'bg-white/80 border-y border-black/5' : 'bg-white/5 border-y border-white/10'}`}>
          <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="text-lg font-semibold">Turn DMs into premium signal.</div>
              <p className={`${subtext} text-sm max-w-2xl`}>
                Refund-backed, escrowed, EU-first. One link in bio; fans see your SLA and refund guarantee.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={joinUrl}
                className={`btn ${isLight ? '!bg-black !text-white' : ''}`}
                onClick={() => t('cta_click', { scope: 'public_home', props: { cta: 'vision_join' } })}
              >
                Claim my handle
              </Link>
              <Link
                href="/fan"
                className={ghostBtn}
              >
                See fan view
              </Link>
            </div>
          </div>
        </section>

        {/* TRUST */}
        <section className="max-w-6xl mx-auto px-4 py-10 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold">Trust, compliance, signal</h2>
              <p className={`${subtext} text-sm`}>Automatic refunds, escrow receipts, EU-ready audit trail.</p>
            </div>
            <Link href={joinUrl} className={`btn ${isLight ? '!bg-black !text-white' : ''}`} onClick={() => t('cta_click', { scope: 'public_home', props: { cta: 'trust_join' } })}>
              Start earning
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <MiniCard title="Refund SLA" text="Auto-refund if you miss the window. Fans see it upfront." isLight={isLight} />
            <MiniCard title="Escrow receipts" text="Every chat is logged; card + wallet flows included." isLight={isLight} />
            <MiniCard title="EU-ready" text="Built in Germany with imprint/privacy; admin audit log." isLight={isLight} />
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className={`w-full border-t ${isLight ? 'border-black/5' : 'border-white/10'}`}>
        <div className={`max-w-6xl mx-auto px-4 py-6 flex flex-wrap gap-4 items-center justify-between text-xs ${subtext}`}>
          <div>(c) {new Date().getFullYear()} Reply or Refund — Built in Germany.</div>
          <nav className="flex items-center gap-4">
            <Link className="hover:opacity-80" href="/imprint">Imprint</Link>
            <Link className="hover:opacity-80" href="/privacy">Privacy</Link>
            <Link className="hover:opacity-80" href="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function MiniCard({ title, text, isLight }: { title: string; text: string; isLight: boolean }) {
  return (
    <div className={`p-4 rounded-2xl ${isLight ? 'bg-white/80 border border-black/5 shadow-sm text-[#0b1420]' : 'card text-white'}`}>
      <div className="text-sm font-semibold">{title}</div>
      <div className={`text-xs ${isLight ? 'text-slate-600' : 'text-white/50'}`}>{text}</div>
    </div>
  );
}

function FeatureCard({ step, title, text, isLight }: { step: string; title: string; text: string; isLight: boolean }) {
  return (
    <div className={`p-4 space-y-2 rounded-2xl ${isLight ? 'bg-white/80 border border-black/5 shadow-sm' : 'card'}`}>
      <div className={`text-[10px] px-2 py-0.5 rounded-full w-fit ${isLight ? 'bg-black/5 border border-black/10 text-[#0b1420]' : 'bg-white/10 border border-white/15'}`}>Step {step}</div>
      <div className="text-sm font-semibold">{title}</div>
      <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-white/50'}`}>{text}</p>
    </div>
  );
}

export async function getServerSideProps(ctx: any) {
  const ref = typeof ctx.query.ref === 'string' ? ctx.query.ref : null;
  if (ref) {
    return {
      redirect: {
        destination: `/creator/join?ref=${encodeURIComponent(ref)}`,
        permanent: false,
      },
    };
  }
  return { props: { refCode: null } };
}
