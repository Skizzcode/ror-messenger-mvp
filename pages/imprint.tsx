// pages/imprint.tsx
import Link from 'next/link';

export default function ImprintPage() {
  return (
    <div className="min-h-screen bg-background text-white flex flex-col">
      <header className="border-b border-white/10 bg-background/70 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-ror-glass.svg" className="h-8 w-8 rounded-2xl border border-white/10" alt="RoR" />
            <span className="text-sm font-semibold">Reply or Refund</span>
          </Link>
          <span className="text-xs text-white/40">Imprint / Anbieterkennzeichnung</span>
        </div>
      </header>
      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold">Imprint</h1>
        <p className="text-sm text-white/65">
          This project is currently in MVP/testing phase. Please replace the information below with your legal provider details.
        </p>

        <div className="space-y-1 text-sm text-white/75">
          <p><strong>Provider:</strong> Your Company / Your Name</p>
          <p><strong>Address:</strong> Street 1, 12345 City, Germany</p>
          <p><strong>Email:</strong> hello@example.com</p>
        </div>

        <p className="text-xs text-white/35">
          According to § 5 TMG (Germany) this page must contain provider information if the service is not purely private.
        </p>
      </main>
      <footer className="border-t border-white/10 py-4 text-center text-xs text-white/35">
        <Link href="/" className="hover:text-white/70">← Back to home</Link>
      </footer>
    </div>
  );
}
