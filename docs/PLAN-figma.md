# Plan: rebuild the 3 journeys from the Figma prototypes

> **Superseded.** This was the first draft, written before the Q&A. It still mentions VI/EN and the open questions that were later decided. The current documents are [`DECISIONS.md`](DECISIONS.md) (decisions), [`workflow.html`](workflow.html) (screen-by-screen workflow) and [`IMPL-PLAN.md`](IMPL-PLAN.md) (implementation and verification). It is kept for history only.

Source data: `figma/` (see `figma/README.md`).

## What stays

The kiosk shell does not change: 16:9 stage (1920×1080, `fit()` scaling), particle world-map background, idle/attract screen, journey picker, left step rail, done screen with QR, VI/EN toggle, `?zone= ?lang= ?idle= ?reload= ?fx= ?qr=`, auto-reload, wake lock, offline `vendor/`.

## What changes

The phone on the right side currently shows hand-made screens. Each journey is rebuilt from its Figma frames, one Figma frame = one step:

| Zone | Brand inside the phone | Steps (Figma frames) |
|---|---|---|
| **SEND** · Vietnam → Australia, medical support for family (Emily Nguyen, NAB) | TPBank, purple `#5B2D90` / `#351755` | 1 Home · 2 Select purpose · 3 Recipient information · 4 Supporting documents · 5 Transfer amount · 6 Review · 7 Face ID authorization · 8 Paperwork review · 9 Approved · 10 Tracking |
| **RECEIVE** · Daniel Carter, USA → Linh, Vietcombank | Visa / VXBS, navy `#12224A` + Visa blue `#1434CB` | 1 Home dashboard · 2 Receive funds · 3 Receiving details (QR) · 4 Incoming tracking · 5 Transfer details · 6 Funds arrived |
| **COLLECT** · seller Linh Studio, Amazon / Shopify / invoices | Visa / VXBS | 1 Earnings dashboard · 2 Upcoming payouts · 3 Channels · 4 Balances · 5 Withdraw · 6 FX conversion · 7 Payout tracking · 8 Settlement history |

Implementation:

1. **Tokens from Figma**, read from `globalVars.styles`: colours, radii, Inter text styles. They become CSS variables, one set per zone (`[data-zone=send]` = TPBank, others = VXBS). The phone itself renders at Figma scale: 402 px wide, ×1.1 in the stage.
2. **Screens as data.** Each Figma frame becomes one entry in `FLOWS[zone].screens`. Copy and numbers come straight from the Figma text (amounts, rates, refs, timestamps), not retyped. Icons are the exported SVGs (`figma/assets/…`), copied into `assets/icons/` and inlined at build time, so the page still works offline.
3. **One tap per step.** Each screen keeps its primary CTA from Figma (New Transfer, Continue, Review withdrawal…) as the "next" action, plus selectable options where Figma shows them (purpose cards, relationship chips, currency rows). A long screen scrolls inside the phone. Status timelines (tracking, paperwork review) animate step by step, like the current "processing" screens.
4. **Bilingual.** Figma is English only. Every string gets a Vietnamese version in the same `[vi, en]` pairs as today, VI by default. Amounts follow the locale, as they already do.
5. **Left rail.** Step names, headline and subline come from each zone's Figma screens. The right-hand "journey" card shows the route (VN → AU, US → VN, Marketplaces → VN).
6. **Disclaimers.** Keep the Figma "Illustrative scenario / Demo" footers. They matter on a public booth screen.

## Verification

- `node --check app.js`.
- Chrome headless screenshots of each step at 1920×1080, compared side by side with `figma/screens/…` (`docs/compare/<zone>-<n>.png`).
- Offline run with the network blocked, plus `?fx=low`.
- Then deploy: push `main` and `gh-pages` → https://noattoan.github.io/vd-booth-demo/, and `vercel --prod` → https://vd-booth-demo.vercel.app.

## Open questions

1. **TPBank brand.** The SEND prototype uses the TPBank name and colours. Is TPBank an agreed partner for this booth? If not, it is replaced with a neutral "Your bank" style.
2. **Step count.** SEND has 10 steps and COLLECT has 8, against 6 today. A booth visit is short. Keep them all, or trim (for example SEND without Paperwork review / Approved)?
3. **Public repo.** `figma/` (design JSON, screen renders) is committed to a public repo, as agreed.
