# Reply or Refund (RoR) – Paid DMs with guaranteed replies or refund

RoR ist ein Next.js 14 MVP für Creator: Fans zahlen (Wallet oder Stripe) für DMs, Creator antworten innerhalb eines SLA (z. B. 48h). Bei substantieller Antwort wird Escrow freigegeben, ansonsten gibt es automatisch Refund. Enthalten sind Wallet/Stripe-Flows, Chat-UI, Creator/Fan Dashboards, Admin-Moderation, Email-Verifikation und Referral-Layer.

## Inhalt
- [Was das Produkt tut](#was-das-produkt-tut)
- [Hauptfeatures](#hauptfeatures)
- [Architektur](#architektur)
- [Setup & Env Variablen](#setup--env-variablen)
- [Lokal starten](#lokal-starten)
- [Auth & Sicherheit](#auth--sicherheit)
- [E-Mail/Notifications](#e-mailnotifications)
- [Referrals/Affiliate](#referralsaffiliate)
- [Admin/Moderation](#adminmoderation)
- [Creator-/Fan-Flows](#creator--fan-flows)
- [Testing/Checks](#testingchecks)
- [ToDos vor Produktion](#todos-vor-produktion)

## Was das Produkt tut
- Fans zahlen (Wallet oder Stripe) und senden eine erste Nachricht.
- Creator haben ein Reply-Fenster (z. B. 48h). Bei Antwort ≥30 Zeichen: Escrow wird freigegeben, sonst Refund.
- Chat-UI unter `/c/[slug]`, Creator-Dashboard unter `/creator/[handle]`, Fan-Inbox unter `/fan`.
- Admin-Panel `/admin` (nur whitelisted Wallets, signierte Requests).

## Hauptfeatures
- Wallet (Solana) + Stripe Checkout (Test/Live), Auto-Refund-Stub.
- E-Mail-Verifikation für Creator (Pflicht, Admin kann bypass).
- Referrals: Creator erhalten Ref-Code, Affiliate-Earnings-Kachel, Anti-Self-Referral.
- Moderation: Admin-Flag/Archive Messages, Ban-Flag für Creator.
- SLA/Trust: Answer-Rate + Avg Reply Time im Chat und Dashboard.
- Share Kit: Chat-Link Copy, Asset-Download.

## Architektur
- Next.js 14 (Pages Router), TypeScript, Tailwind/CSS.
- Upstash Redis als JSON-DB (`lib/db.ts`, `readDB`/`writeDB`).
- API-Routen unter `/api/*` (async DB).
- Wallet Adapter (Phantom/Solflare) + Stripe SDK.
- Emails via Resend (HTTP API) – fallback: console.log ohne Key.

## Setup & Env Variablen
Unbedingt setzen (Vercel env oder `.env.local`, nicht einchecken):
- `ROR_SESSION_SECRET` – starker Secret (>=16 chars) für Creator-Sessions.
- `ADMIN_WALLETS` – Komma-separierte Admin-Wallets (nur diese dürfen /admin).
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `NEXT_PUBLIC_SITE_URL` – Basis-URL (für Links/Emails)
- `NEXT_PUBLIC_SOLANA_RPC` – optional, sonst devnet default
- `RESEND_API_KEY` – optional, für echte Emails; sonst werden Mails geloggt
- `MAIL_FROM` – Absender für Emails (z. B. verifizierte Domain bei Resend)
- Optional: `INVITE_ONLY=false` um Referral-Pflicht beim Claim abzuschalten

## Lokal starten
```bash
npm install
npm run dev
# env in .env.local setzen (s.o.)
```

## Auth & Sicherheit
- Creator-Dashboards: Session-Cookie signiert mit `ROR_SESSION_SECRET`; zusätzlich Wallet-Bindung je Handle (eine Wallet → ein Handle). Email muss verifiziert sein (Admin kann bypass).
- Admin: Nur signierte Header (`x-wallet`, `x-msg`, `x-sig`), keine Cookies. Wallet muss in `ADMIN_WALLETS` whitelisted sein.
- Handle/Wallet Einzigartigkeit: Claim & Settings prüfen auf bereits gebundene Wallet/Handle.
- Anti-Self-Referral: Ref-Code des gleichen Creators wird ignoriert, Self-Referral beim Claim blockiert.
- Ban-Flag: Gebannte Creator können keine Threads annehmen; Admin kann bannen/entbannen.

## E-Mail/Notifications
- Resend-Client in `lib/mail.ts` (HTTP). Ohne `RESEND_API_KEY` nur console.log.
- Verifikation: Claim/Email-Änderung sendet Code; `POST /api/creator/verify-email` prüft ihn. Resend-Code kann per `POST /api/creator/send-code` neu gesendet werden.
- New DM Emails: `create-thread` (Wallet) und `checkout/webhook` (Stripe) mailen verifizierten Creators einen Chat-Link.

## Referrals/Affiliate
- Ref-Code pro Creator (Claim/Settings). Anti-Self-Referral aktiv.
- `/api/ref-stats?code=...` (Wallet-signiert) liefert Referral-Earnings/Counts.
- Dashboard-Kachel zeigt Ref-Earnings (answered revenue), Copy-Link im Invite-Card.

## Admin/Moderation
- `/admin` UI (nur whitelisted Wallets, signMessage). Creator-Liste, Threads/Messages. Messages sind ausgegraut und per Klick sichtbar, Flag+Archive-Button (calls `/api/admin/flag-message`).
- APIs: `admin/overview`, `admin/export` (CSV/JSON), `admin/flag-message`, `admin/report`, `admin/audit`.
- Flags/Audit werden in DB (`flags`, `audit`) gespeichert.

## Creator-/Fan-Flows
- Claim (Wallet-signiert) → Email-Verify → Dashboard. Wallet/Handle unique. Ref-Code optional (invite).
- Dashboard: SLA-Badges, Chat-Preview mit letztem Fan-Msg, Profile/Settings, Ref-Earnings, Invite, Share Kit (Chat-Link copy, Asset).
- Fan: `/fan` Inbox (wallet), `/c/[slug]` Chat (Wallet oder Stripe Checkout).
- Stripe: `/api/checkout/create` → metadata → `/api/checkout/webhook` erzeugt Thread; Success-Page nutzt `/api/checkout/lookup`.

## Testing/Checks
- `npm run build` (TS/Lint).
- Manuelle Flows:
  - Claim + Email-Verify + Dashboard Access (Wallet-bound).
  - Admin Sign-In (non-admin → 403, admin → ok).
  - Wallet Chat → Thread created; Stripe Checkout → Thread created; Success shows link.
  - Referral stats endpoint with signed headers.
  - Email send (wenn Resend-Key + verifizierte Domain/Recipient).

## ToDos vor Produktion (rechtlich/operativ)
- Domain + DKIM/SPF für Mail-Absender; Impressum/AGB/Datenschutz (DSGVO), Klarstellung Refund-SLA.
- AVVs mit Stripe, Upstash, Resend, Vercel abschließen.
- KYC/Steuer-Rolle klären (Marktplatz vs. Vermittler); Gebühren kommunizieren.
- Rate-Limits/Spam-Keywords aktivieren; Consent/Tracking klären, ggf. Cookie-Banner.
- Onboarding-Material/Share-Assets finalisieren, Showcase mit echten Creators.
