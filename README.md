
# Reply or Refund — Direct Chat + 48h Escrow (MVP)

Mobile-first Messenger mit gesperrter Zahlung (Escrow). Creator antwortet → Payout. Keine Antwort → Auto-Refund.

## Quickstart
```bash
npm i
npm run dev
# open http://localhost:3000
```

## Was schon drin ist
- Mobile Messenger UI (Next.js + Tailwind)
- Threads + Messages (Datei-basierter Stub-DB)
- Escrow-API **Stub** (`/lib/escrow.ts`) – hier Solana/USDC-Calls verdrahten
- Endpoints: `/api/create-thread`, `/api/message`, `/api/reply`, `/api/refund-cron`, `/api/thread?id=...`
- Timer/Deadline im UI

## To wire next
- Solana Program (init/reply/refund) via Anchor
- Wallet-Login (Phantom) + E2E-Encryption (libsodium)
- Fiat On-Ramp → USDC → Escrow (optional)
- Stripe/Fees nur bei Erfolg

## ENV
```
# .env.local
# (platzhalter)
POSTHOG_KEY=
RESEND_KEY=
```

## Lizenz
MVP für Evaluierung.
