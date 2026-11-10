# Q&A and decisions: Figma rebuild (branch `figma-wip`)

Decision log for rebuilding the booth demo from the two Figma prototypes. Each decision is final until it is changed **here** first, then in `docs/workflow.html`, then in the code.

- Source: `figma/` (Framelink pull, 29/10/2026; Figma last modified 15/10/2026)
- Screen-by-screen workflow: [`docs/workflow.html`](workflow.html), live at https://vd-booth-demo-wip.vercel.app/docs/workflow.html
- Decided by: the product owner (Q&A in the Claude Code session, 29/10/2026)

## Scope and principles

| # | Question | Decision |
|---|---|---|
| D1 | How closely do we follow the prototype? | **100%.** Every Figma frame is one step (SEND 10, RECEIVE 6, COLLECT 8). Copy, amounts, rates, refs and status-bar times are taken verbatim from the JSON. TPBank branding stays in SEND. |
| D2 | Language? | **English only**, including the kiosk shell. The VI/EN switch is removed. |
| D3 | Content taller than the 874 px phone? | **Scroll inside the phone**, plus an **animated hint at the bottom** (fade + bouncing chevron) until the bottom is reached. Header and footer CTA stay fixed, as in Figma. |
| D4 | Where does the WIP go? | Branch **`figma-wip`**, deployed to a **new Vercel project `vd-booth-demo-wip`** (https://vd-booth-demo-wip.vercel.app). The old demo (`main`, `gh-pages`, https://vd-booth-demo.vercel.app, GitHub Pages) is not touched. |
| D5 | How do we work out the flow, given that Figma has no prototype links? | Scan the screen content, write a workflow doc for review (`docs/workflow.html`), then implement from that doc. Order = canvas order + the "n of 6" counters. |

## Design gaps (Q1–Q8)

| # | Issue in the design | Decision |
|---|---|---|
| Q1 | RECEIVE: the canvas order is Tracking → Transfer details → Funds arrived, but Details is already "Completed" before the success screen. | **Keep the canvas order.** |
| Q2 | RECEIVE: Receiving details and Transfer details have no forward CTA. | **A "Next" button on the kiosk shell** (left rail, outside the phone). The Figma screens are left untouched. |
| Q3 | COLLECT: Upcoming payouts, Channels, Payout tracking and Settlement history have no forward CTA. | **Tab bar + auto-advance + Finish.** Upcoming → tap tab *Channels*. Channels → tab *Balances*. Payout tracking moves to History on its own once its timeline finishes. History shows a *Finish* button on the kiosk → Done. |
| Q4 | COLLECT: Withdraw / FX are 2,500 USD → 63,295,800 ₫, but Payout tracking is 1,500 USD → 37,977,480 ₫ (at 09:10, before the 09:41 quote). | **Keep the Figma values.** Designer to fix, then pull again. |
| Q5 | RECEIVE Home already lists "Daniel Carter +63,295,800 ₫ Completed", which gives away the journey's ending. | **Keep the Figma values.** |
| Q6 | SEND recipient form: First Name = "Emily Nguyen", Last Name = "Nguyen". | **Keep the Figma values.** Designer to fix. |
| Q7 | Kiosk shell brand? | **Per journey.** SEND: "VISA Direct × TPBank". RECEIVE / COLLECT: "VISA / VXBS". Inside the phone, each prototype's own brand. |
| Q8 | End of a journey: there is no receipt screen in Figma, and the Done QR is a placeholder. | The last CTA (View Transfer Receipt / Transfer Again / Finish) → kiosk **Done** screen. **The QR points to https://vd-booth-demo.vercel.app/** (still overridable with `?qr=`). |

## Notes for the designer (from Q4–Q6)

1. COLLECT Payout tracking should track the 2,500 USD withdrawal that was just quoted (63,295,800 ₫, after 09:41).
2. RECEIVE Home "Recent Transactions" shows the journey's own result before it happens.
3. SEND Beneficiary details: First Name holds the full name.
4. RECEIVE / COLLECT avatar: "NL" on Home, "LS" on the seller screens (same person, Linh).

## Change log

- 2026-10-29: D1–D5 and Q1–Q8 decided.
- 2026-11-10: Figma pulled again (edited 2026-11-09). SEND is now Vietnam Pioneer Bank and gains step 11 "Visa transfer success" (`22:134`), whose "View transfer receipt" leads to Done (Q8). VXBS copy: Vietcombank → Vietnam Bank, "VXBS" dropped from the screens, so the kiosk brand for RECEIVE / COLLECT is now "VISA" alone (Q7). Q4–Q6 are still open in Figma. Two new AFT files pulled for the next phase (five experiences).
- 2026-11-10: Five experiences (client brief): SEND 1, RECEIVE 4 (VXBS individual, VXBS seller, AFT friends & family, AFT travel). The AFT designs are read from Save-local-copy `.fig` files (`scripts/figma-fig`), verified equal to the API Framelink pull. Step order: F&F = the storyboard numbers 01–18 (recovery states A–E not shown, pending Q&A); travel = the frames' node order (Welcome → My Vietnam trip). Each step advances on its own CTA; kiosk Next on F&F 6–7 and travel 17, Finish on travel 18, auto-advance on F&F 14 and travel 10. The phone takes the Figma device size (414×896 for AFT). F&F shows whose phone is on screen (storyboard swimlane). Verify: 61/61 screens hard-green, flow PASS.
- 2026-11-10 (Q&A): F&F recovery states A–E are left out. Lead capture = QR → form on the visitor's phone → Vercel Function → Neon Postgres (replaces Q8's QR target). Auto-populate = fields type themselves in, the visitor taps on. Deployed to production the same day.
