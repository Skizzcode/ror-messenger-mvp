// pages/index.tsx
import Link from 'next/link';

export default function Home({ refCode }: { refCode: string | null }) {
  return (
    <div className="min-h-screen bg-background text-white flex flex-col">
      {/* HEADER */}
      <header className="w-full border-b border-white/10 bg-background/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo-ror-glass.svg" alt="RoR" className="h-9 w-9 rounded-2xl border border-white/10" />
            <div>
              <div className="text-sm font-semibold tracking-tight">Reply or Refund</div>
              <div className="text-[10px] text-white/35">Paid DMs for creators</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/fan"
              className="text-sm px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition"
            >
              Fan dashboard
            </Link>
            <Link
              href="/creator/join"
              className="text-sm px-3 py-1.5 rounded-full bg-white text-black"
            >
              Become a creator
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-4 py-12 grid gap-10 lg:grid-cols-2 items-center">
          {/* LEFT */}
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-400/10 border border-emerald-400/30 text-emerald-50 text-xs">
              Built in Germany 🇩🇪
              <span className="text-white/50">— EU compliant ready</span>
            </span>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              Paid DMs that self-refund.
              <br />
              <span className="text-white/40">Reply → get paid. No reply → fan gets money back.</span>
            </h1>
            <p className="text-white/50 text-sm md:text-base max-w-xl">
              Fans pay to talk to you. You get a 1:1 chat with a countdown. If you answer in time, escrow releases to you.
              If you don’t, the fan gets an automatic refund. No spam, no begging, no “seen”.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href={refCode ? `/creator/join?ref=${refCode}` : '/creator/join'}
                className="btn"
              >
                I’m a creator
              </Link>
              <Link
                href="/fan"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/15 text-sm hover:bg-white/5"
              >
                I’m a fan
              </Link>
              <Link
                href="/c/creator-demo"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/0 text-sm text-white/50 hover:bg-white/5"
              >
                View demo chat →
              </Link>
            </div>

            <div className="flex gap-4 items-center text-xs text-white/35">
              <div>
                <div className="text-white font-semibold">48h reply window</div>
                <div>auto-refund afterwards</div>
              </div>
              <div>
                <div className="text-white font-semibold">Wallet or card</div>
                <div>for fans</div>
              </div>
              <div>
                <div className="text-white font-semibold">Creator → creator referrals</div>
                <div>recurring upside</div>
              </div>
            </div>
          </div>

          {/* RIGHT – mock chat */}
          <div className="bg-white/5 border border-white/10 rounded-3xl p-4 md:p-6 backdrop-blur space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img src="/logo-ror-glass.svg" alt="RoR" className="h-9 w-9 rounded-2xl border border-white/10" />
                <div>
                  <div className="text-sm font-semibold">Chat with @creator</div>
                  <div className="text-[10px] text-white/35">43m left • escrow locked</div>
                </div>
              </div>
              <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/20">
                €20
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="max-w-[80%] bg-white text-black rounded-2xl rounded-bl-md px-3 py-2 text-xs">
                Hey, quick question about your drop 👀
              </div>
              <div className="max-w-[80%] bg-black/25 border border-white/5 rounded-2xl rounded-br-md px-3 py-2 text-xs ml-auto">
                Thanks for reaching out 🙌 what do you want to know exactly?
              </div>
              <div className="text-[10px] text-white/30 mt-3">
                Creator replies → funds release. No reply → automatic refund.
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="max-w-6xl mx-auto px-4 py-10 space-y-5">
          <h2 className="text-lg font-semibold">How it works</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="card p-4 space-y-2">
              <div className="text-sm font-semibold">1. Create your inbox</div>
              <p className="text-sm text-white/45">
                Pick your handle, upload your avatar, connect your wallet.
              </p>
            </div>
            <div className="card p-4 space-y-2">
              <div className="text-sm font-semibold">2. Fans pay to DM you</div>
              <p className="text-sm text-white/45">
                They can use wallet or card. Every chat has a timer.
              </p>
            </div>
            <div className="card p-4 space-y-2">
              <div className="text-sm font-semibold">3. Reply or refund</div>
              <p className="text-sm text-white/45">
                You reply → funds go to you. You don’t → fan gets a refund.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="w-full border-t border-white/5 mt-6">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-wrap gap-4 items-center justify-between text-xs text-white/35">
          <div>© {new Date().getFullYear()} Reply or Refund. Built in Germany.</div>
          <div className="flex gap-4">
            <Link href="/imprint" className="hover:text-white/80">Imprint</Link>
            <Link href="/privacy" className="hover:text-white/80">Privacy</Link>
            <Link href="/terms" className="hover:text-white/80">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// if a creator invite hits "/", redirect to /creator/join
export async function getServerSideProps(ctx: any) {
  const ref = typeof ctx.query.ref === 'string' ? ctx.query.ref : null;
  if (ref) {
    return {
      redirect: {
        destination: `/creator/join?ref=${ref}`,
        permanent: false,
      },
    };
  }
  return { props: { refCode: null } };
}
