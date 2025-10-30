// pages/terms.tsx
import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-white flex flex-col">
      <header className="border-b border-white/10 bg-background/70 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-ror-glass.svg" className="h-8 w-8 rounded-2xl border border-white/10" alt="RoR" />
            <span className="text-sm font-semibold">Reply or Refund</span>
          </Link>
          <span className="text-xs text-white/40">Terms of use</span>
        </div>
      </header>
      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold">Terms of service</h1>
        <p className="text-sm text-white/65">
          This is an MVP. The core mechanic is “reply within a time window or the fan gets a refund”.
          Creators are responsible for replying in time. We may change the time window, payout logic or UI at any time.
        </p>
        <h2 className="text-lg font-semibold mt-4">Important</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm text-white/65">
          <li>Creators must connect a wallet to receive payouts.</li>
          <li>Fans must use a valid payment method or wallet to start a chat.</li>
          <li>Abuse, spam and illegal content can be removed.</li>
        </ul>
        <p className="text-xs text-white/35">
          Add your real ToS / AGB here (especially for VAT, invoicing, KYC if you go big).
        </p>
      </main>
      <footer className="border-t border-white/10 py-4 text-center text-xs text-white/35">
        <Link href="/" className="hover:text-white/70">← Back to home</Link>
      </footer>
    </div>
  );
}
