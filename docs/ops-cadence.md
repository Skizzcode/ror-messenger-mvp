# Ops & Tracking Cadence (Codex)

## Kernmetriken (täglich prüfen)
- SLA: % offene Threads < SLA-Deadline, avg reply time (24h/48h Ziel), answer rate.
- GMV: MTD, pro Creator; Fast-Lane-Anteil; Offer-Anteil.
- Refund-Quote: Refunds/Threads und Gründe (SLA miss, schlechte Antwort).
- Conversion: Chat visits -> Checkout -> Thread created -> First reply.
- Referral: Neue Creator per Ref-Code, Revenue aus Ref.

## Daily Ritual
- Pull offene Threads + Deadline (z.B. /api/creator-threads) und flagge <12h Rest.
- Nudge Creators mit drohender SLA (manuell oder simple Script/Email).
- Check Refund-Cron Logs, offene Refund-Fälle manuell entscheiden, falls Grenzfälle.
- Spot-Check Answer Rate/Avg Reply und markiere Ausreißer (unter 60% answer rate oder avg reply > SLA).

## Weekly Ritual
- Review GMV/Creator, Fast-Lane Uptake, Offer Uptake.
- Review Refund-Quote; wenn >5–10%, Ursachen festhalten (SLA miss vs. Content).
- Referral-Trichter: Neue Creator, aktiv ja/nein, Revenue.
- Pricing/Offer Adjust: ggf. Standardpreis + Fast-Faktor anpassen pro Creator.

## Playbooks (Kurz)
- SLA Miss: Wenn Deadline überschritten -> Refund + Info an Fan + Hinweis an Creator; ggf. Flag wenn wiederholt.
- Drohende SLA: <12h Rest -> Nudge (Email/DM) + Priorisieren in UI; ggf. Fast-Lane blocken, wenn creator consistently slow.
- Poor Answer Quality (Fan meldet): Flag-Message-API nutzen, kurze Audit; bei systematischen Fällen Offer/Preis drosseln oder temporär sperren.
- High Refund Rate Creator (>10%): Manuell review; temporär Checkout deaktivieren (maintenance/ban flag), SLA/Pricing anpassen.

## Tooling/Automatisierung (leichtgewicht)
- Script/Route für „SLA radar“: Liste offene Threads + remainingMs sortiert; exportierbar/anzeigbar im Admin.
- Alerting light: Vercel Cron 1–2x/Tag, schreibt Warnungen in Log oder schickt Email (Resend) bei threshold (z.B. >5 Threads <12h Rest).
- Telemetry: schon vorhanden; ergänzen: Checkout->Thread conversion, Refund reason tag.

## Rollen/Approvals
- Finanzielle Aktionen (Refund, Ban) immer mit menschlicher Freigabe (Solo-Review).
- Automatisch erlaubt: SLA-Nudge, Listing/Sortierung, Read-only Alerts.

