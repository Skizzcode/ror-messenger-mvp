// pages/checkout/cancel.tsx
export default function CheckoutCancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="max-w-md w-full p-6 bg-white/5 rounded-2xl border border-white/10">
        <h1 className="text-2xl font-bold mb-2">Payment canceled ❌</h1>
        <p className="text-sm text-white/60 mb-4">
          You canceled the checkout. No money was charged.
        </p>
        <a
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black font-medium"
        >
          Back to app
        </a>
      </div>
    </div>
  );
}
