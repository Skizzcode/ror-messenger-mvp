# Reply or Refund (RoR) – MVP

**Kurzidee:**  
Creators können einen Link/Embed in ihre Bio packen. Fans können dort eine Nachricht schicken und **Geld hinterlegen** (Wallet oder Stripe). Der Creator hat ein Zeitfenster (z. B. 48h), um **substanziell zu antworten**.  
- Antwort kommt rechtzeitig → Creator kriegt Geld  
- Keine Antwort → Fan bekommt Geld zurück (refund / escrow release)

Wir bauen das als **100 % self-serve**, **1-Klick-Flow**, **wallet-first**, aber mit **Fallback Stripe**, damit auch Nicht-Krypto-Leute zahlen können.

---

## Zielbild

- Produkt soll sich in 5 Min. erklären lassen
- Creator sollen es in ihre Bio packen können (Insta, TikTok, X, Link in Bio)
- Keine manuellen Auszahlungen
- Später: eigenes Rev-/Referral-System: „wer Creator onboardet, verdient mit“
- Langfristig: eigenes Onchain-Escrow-Programm (Solana), heute nur Stub

---

## Aktueller Stand (Stand: MVP 1)

✅ **Next.js 14 App** auf Vercel  
✅ **Wallet Connect (Solana)** eingebaut  
✅ **Chat-UI** unter `/c/[slug]`:
- Fan kann Nachricht schicken
- Creator kann antworten
- Enter / Shift+Enter Verhalten
- Auto-Scroll  
✅ **Thread-API** (`/api/thread?id=...`) – liefert Thread + Messages  
✅ **Message-API** (`POST /api/message`) – speichert Message, triggert „answered“  
✅ **Creator/Fan-Signaturen** (`lib/sign.ts`, `lib/verify.ts`) → keine Fake-Nachrichten  
✅ **Stripe-Test-Payments** via `/api/checkout/create`  
✅ **Stripe-Webhooks** via `/api/checkout/webhook` → legt Thread nach Zahlung an  
✅ **Success-/Cancel-Pages** (`/checkout/success`, `/checkout/cancel`)  
✅ **Upstash / async DB** – alle relevanten API-Routen sind auf `await readDB()`  
✅ **Auto-Refund-Mechanik** (MVP):  
- `/api/refund-cron.ts`  
- `/api/maintenance/cleanup.ts`  
→ läuft on demand, nicht per Vercel-Cron

---

## Warum async DB?
Weil wir auf Vercel sind und nicht lokal eine JSON-Datei rumkloppen wollen. Deshalb haben wir `lib/db.ts` auf eine Upstash-ähnliche Struktur umgestellt:

- `readDB()` → **async** → holt den kompletten JSON-State
- `writeDB(db)` → **async** → speichert den JSON-State
- `DB`-Shape:  
  ```ts
  {
    threads: {
      [id: string]: {
        id: string;
        creator: string;
        fan: string;
        amount: number;
        status: 'open'|'answered'|'refunded';
        deadline: number;
        fan_pubkey?: string | null;
        creator_pubkey?: string | null;
        createdAt?: number;
        answeredAt?: number;
        refundedAt?: number;
        paid_via?: 'wallet' | 'stripe';
      }
    },
    messages: {
      [threadId: string]: Array<{
        id: string;
        threadId: string;
        from: 'fan' | 'creator';
        body: string;
        ts: number;
      }>
    },
    creators: {
      [handle: string]: {
        handle: string;
        price: number;
        replyWindowHours: number;
        wallet: string | null;
        refCode: string;
      }
    },
    escrows: {
      [threadId: string]: {
        status: 'locked' | 'released' | 'refunded';
        until?: number;
        releasedAt?: number;
      }
    },
    checkouts?: {
      [stripeSessionId: string]: {
        threadId: string;
        creator: string;
        amount: number;
        createdAt: number;
      }
    }
  }
Wichtig: alle API-Routen, die readDB() nutzen, müssen await benutzen – das haben wir heute alles gefixt.

Wichtigste API-Routen
1. POST /api/create-thread
Zweck: Fan startet eine neue Konversation mit Signatur

Request-Body:

json
Code kopieren
{
  "creator": "creator-demo",
  "fan": "fan-demo",
  "amount": 20,
  "ttlHours": 48,
  "firstMessage": "hello",
  "fanPubkey": "...",             // Wallet des Fans
  "creatorPubkey": null,

  "sigBase58": "...",             // Signatur über message
  "msg": "ROR|create-thread|...",
  "pubkeyBase58": "..."           // muss == fanPubkey sein
}
Server:

checkt Prefix

checkt Timestamp (max. 5 min)

checkt Signatur

legt Thread + erste Message an

initiiert Escrow (Stub)

2. POST /api/message
Zweck: neue Message in existierendem Thread

Wenn from === 'creator' und Text ≥ 30 Zeichen → Escrow wird freigegeben → Thread auf answered

3. GET /api/thread?id=...
Zweck: Chat in /c/[slug] füttern

gibt: { thread, messages }

4. POST /api/checkout/create
Zweck: Stripe-Checkout erstellen (für Leute ohne Wallet)

nimmt: creator, amount, ttlHours, firstMessage

gibt: { url }

leitet auf Stripe-Testseite

5. POST /api/checkout/webhook
Wird von Stripe gerufen

extrahiert creator, amount, ttlHours, firstMessage aus metadata

legt Thread serverseitig an

legt Messages an

markiert Escrow als „locked“

6. GET /api/checkout/lookup?sid=...
Zweck: unsere eigene Success-Page füttern

7. GET /api/creator-threads?handle=...
liefert alle Threads für einen Creator → Grundlage für das Creator-Dashboard

8. GET /api/fan-threads?fanPubkey=...
liefert alle Threads für einen Fan → Grundlage für Fan-Inbox

Frontend-Seiten (Stand jetzt)
/c/[slug] – Chat

Wallet-Connect-Button (dynamic import)

Shift+Enter = newline, Enter = senden (Desktop)

Auto-Scroll

Lockt Escrow beim ersten Chat (Stub)

/checkout/success – nach Stripe

holt sich sid, fragt /api/checkout/lookup

zeigt Link zum Chat

/checkout/cancel – simple „abgebrochen“-Seite

Was noch fehlt:

/creator/[handle] – Dashboard für Creator (wir haben dir schon mal eine erste Version gegeben, die SWR lädt – die musst du nur final reinlegen)

/fan – Inbox für Fans

Nächste sinnvolle Schritte (aus dem Chat)
Creator-Dashboard richtig machen

Seite: pages/creator/[handle].tsx

Lädt:

/api/creator-stats?handle=...

/api/creator-threads?handle=...

Zeigt: Open / Answered / Refunded Tabs

Button „Open chat“ → /c/[threadId]

Input für „My Solana wallet“ → POST /api/creator-settings

Fan-Dashboard bauen

Seite: pages/fan.tsx

Wenn Wallet connected:

fragt /api/fan-threads?fanPubkey=...

zeigt offene vs. beantwortete

So können Fans nach Stripe-Payment später ihre Konversation einsehen

Ref-/Affiliate-Layer

Wir speichern bereits refCode pro Creator in /api/creator-settings

Nächster Schritt: bei Thread-Erstellung ?ref=... mitschicken und im DB-Eintrag ablegen

Später: kleine /api/payout-preview bauen, die zeigt, was ein Referrer verdient hat

Onchain-Escrow später

Wir haben schon lib/escrowClient.ts mit PDAs und Mock-TX

Wenn das Anchor-Programm steht, ersetzen wir im Frontend den Stub-Aufruf

Cron richtig

Vercel Hobby kann kein stündlich

Deshalb manuell oder extern (GitHub Actions → ruft /api/maintenance/cleanup)

.env Beispiel
env
Code kopieren
# frontend
NEXT_PUBLIC_SITE_URL=https://ror-messenger-mvp.vercel.app
NEXT_PUBLIC_SOLANA_RPC=https://<dein-helios-devnet-endpoint>

# solana (server-seitig, falls du getrennt arbeiten willst)
SOLANA_RPC=https://<dein-helios-devnet-endpoint>
SOLANA_COMMITMENT=confirmed

# stripe (TEST MODE!)
STRIPE_SECRET_KEY=sk_test_1234567890
STRIPE_WEBHOOK_SECRET=whsec_1234567890

# upstash (REST)
UPSTASH_REDIS_REST_URL=https://eu1-funny-....upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxx

# optional
NEXT_PUBLIC_APP_NAME=Reply or Refund
Projektstruktur (vereinfacht)
text
Code kopieren
pages/
  _app.tsx
  index.tsx            # (Landing / placeholder)
  c/[slug].tsx         # Chat UI
  checkout/
    success.tsx
    cancel.tsx
  api/
    thread.ts
    message.ts
    create-thread.ts
    creator-settings.ts
    creator-stats.ts
    creator-threads.ts
    fan-threads.ts
    checkout/
      create.ts
      webhook.ts
      lookup.ts
    maintenance/
      cleanup.ts
    refund-cron.ts
lib/
  db.ts                # readDB / writeDB async
  escrow.ts            # server-stub
  escrowClient.ts      # client-stub (Solana-ready)
  solana.ts
  sign.ts              # client-side signing
  verify.ts            # server-side verify
  ttl.ts               # lazy expiry per thread
  stripe.ts
components/
  WalletCtx.tsx
Bewertung Fortschritt
✅ Core-Concept steht

✅ „Geld rein“ steht (Stripe)

✅ „Geld nur gegen Antwort“ steht (Auto-release bei substantial message)

✅ „Kein Spam“ steht (Wallet/Stripe + rate limit)

✅ „Timeout → refund“ steht (Cron + cleanup)

✅ Deploy auf Vercel steht

🟡 „Multi-user Dashboard“ fehlt

🟡 „Referral“ fehlt

🟡 „Design“ ist MVP (aber Basis Tailwind-ready)

Prompts, die du morgen wieder benutzen kannst
1. „Starte da, wo wir aufgehört haben“
text
Code kopieren
Du bist „GPT-Venture-Studio v1“. Kontext: Wir bauen „Reply or Refund“, ein wallet-/stripe-basiertes 1:1-Messenger-Produkt für Creator, bei dem Fans zahlen und eine garantierte Antwort bekommen, sonst Refund. Stack: Next.js 14, Vercel, Upstash (Redis REST), Solana Wallet Adapter, Stripe (Test Mode), alle API-Routen sind async und nutzen readDB()/writeDB() aus lib/db.ts. Dein Job: immer vorausdenken, immer in kleinen, kopierbaren Code-Blöcken liefern, alles auf Englisch coden, aber auf Deutsch erklären. Wir haben schon: /c/[slug], /api/thread, /api/message, /api/create-thread, /api/checkout/*, /api/creator-*, /api/fan-*, /api/maintenance/cleanup, WalletCtx, escrow stubs. Wir wollen jetzt die fehlenden Screens (Creator Dashboard, Fan Inbox), dann Ref-Layer, dann später echtes Onchain Escrow. Antworte immer mit: 1) kurzer Erklärung für Dummies 2) komplette Datei (copy-paste) 3) was wir als Nächstes machen.
2. „Gib mir nur die Datei“
text
Code kopieren
Gib mir nur die komplette Datei, copy-paste ready, ohne weitere Erklärungen. Projekt ist das gleiche wie vorher (Reply or Refund).
3. „Fehler fixen“
text
Code kopieren
Ich habe auf Vercel einen Build-Fehler. Wir nutzen async readDB()/writeDB() aus lib/db.ts. Alle API-Routen müssen await nutzen. Analysiere meinen Fehler und gib mir die komplette korrigierte Datei.
4. „Erweitere Dashboard“
text
Code kopieren
Wir brauchen eine Seite pages/creator/[handle].tsx, die /api/creator-stats und /api/creator-threads aufruft und in 3 Tabs (Open, Answered, Refunded) anzeigt. Styling minimal (schwarzer Hintergrund, Cards), SWR nutzen. Code komplett.
Wenn du willst, machen wir im nächsten Schritt genau das Creator-Dashboard – das ist jetzt wirklich nur noch Frontend zusammenstecken.
