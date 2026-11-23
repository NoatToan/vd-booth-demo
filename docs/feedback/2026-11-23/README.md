# Feedback 23/11/2026 15:58 (phase 4)

Hoa Nguyen: "The animation looks great, I'm only seeking your support to correctly place the Visa approval step."
Needed for a test on the booth screen on 24/11 morning. Live page: <https://vd-booth-demo.vercel.app/test-changes/#item-27>.

| # | Feedback | Change |
|---|---|---|
| 27 | Send: the Visa tick animation should go after the step "Transfer Progress" | send-7 plays Face ID only, then send-8; send-10 "View transfer receipt" plays the Visa securing (light), then send-11 (`screens/behaviors.js`) |
| 28 | F&F: remove the step "Sending your money" | family-14 dropped (`scripts/gen/client-edits.json`); the journey has 17 steps |
| 29 | F&F: move the Visa tick right before "Payment Sent" | family-13: Face ID → Visa tick → family-15 (follows from 28) |

Decided on our side: Face ID stays on Send step 7; the tick on step 10 starts on the tap of "View transfer receipt".
Hoa's "The animation looks great" is recorded on items 22–25 as the confirmation of the phase 3 decisions.

Evidence: `before/` (production at d587609), `after-local/`, `after-deployed/`, boxes in `annotations.json`, the email's
photos in `email/`, Figma frames in `figma/`. `video/`: `tests/e2e/animations.spec.mjs` for send-7, send-10 and family-13.
Verify: `scan` windows in `scripts/verify/screens.json` are send-7 4300–5100 ms (Face ID) and send-10 2500–3300 ms (Visa securing).
