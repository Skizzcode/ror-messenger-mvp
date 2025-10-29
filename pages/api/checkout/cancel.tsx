// pages/checkout/cancel.tsx
import Link from 'next/link';

export default function Cancel(){
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="card p-6 space-y-4 max-w-lg w-full text-center">
        <h1 className="text-2xl font-bold">Checkout canceled</h1>
        <p className="text-muted">No charge was made.</p>
        <Link href="/" className="btn">Back home</Link>
      </div>
    </div>
  );
}
