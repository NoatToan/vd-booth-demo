# Feedback 18/11/2026 14:54 (phase 3)

Hoa Nguyen, "some final comments". The two attached videos (Travel wallet screen.mp4, Card link verification.mp4) were
recorded from the Figma Make "Payments in Motion" (pV7Pplh74jwD3QRkNZvaDM), so the booth plays the Make's own components:
its Lottie files (`brand/lottie/`, from `src/imports/Face_Id_Authenticate_sucess.json`, `shared/docs/visa_white_small_padding.json`,
`shared/docs/VISA_BLUE_001.json`, played by `vendor/lottie_light.min.js`) with the Make's sizes, colours and timings.
Live page: <https://vd-booth-demo.vercel.app/test-changes/#item-21> (items 21–25).

| # | Feedback | Change | Make source |
|---|---|---|---|
| 21 | VXBS: this part can you do auto-population of the numbers? | receive-2: 2,500.00 types in, fee / amount to convert / VND count up | (booth's own typeIn / countUp) |
| 22 | F&F and Send: animated Face ID like "Travel wallet screen" | family-13 and send-7: Face ID overlay ("Verify with Face ID"), Lottie 70 px at 2×, then 1.5 s | flows/topup/NewPaymentMethod.tsx FaceIDScreen |
| 23 | Visa animated authorization; Visa logo bigger and in the middle (me-to-me, me-to-you) | Securing step after Face ID (F&F, Send: light) and on travel-9 (dark); Visa Lottie centred, box 110 → 150 px dark, 416 → 500 px light; circle and tick; then 1.4 s | shared/securing-animation/VdaUsa07.tsx |
| 24 | Travel: an animated Face ID step called "Verify it's you" after Card linked | new step travel-6v (client-edits.json op `step`): dark Face ID screen, Lottie 76 px at 1.3×, "Face ID confirmed", then 0.9 s, auto | kira/screens/otp-verify.tsx |
| 25 | Travel: an animated message like "Card link verification" | travel-5: Visa logo in the card field, "Validating card…" 0.8 s, "Card eligible for funding", "billed in AUD · Outback Bank, Sydney", then the security code | kira/screens/add-money-card-details.tsx |

Decisions to confirm are on the test-changes page (items 22–25). Evidence: `before/` (production at a6a58d2),
`after-local/`, `after-deployed/`, boxes in `annotations.json`; email images and the Card link video in `email/`.

## Make vs booth, recorded

- `compare/*.mp4`: left the Figma Make's own component, run from its source in a reference harness (React, motion,
  lottie-react 2.4.1, Tailwind, the Make's files unchanged), right the booth; both recorded with Playwright and started
  at the same moment. `compare/*-frames.jpg`: frames at the same times, Make above, booth below.
- `video/*.webm`: `tests/e2e/animations.spec.mjs` (`pnpm --dir tests/e2e test animations`) plays each animation on the
  booth with Playwright video on and checks timing, centring on the phone (the Lottie box ≤ 1 px from the centre, the tick ≤ 2 px) and the Make's texts.
- Fixes from the comparison: the light Visa box (500 px) is centred on the 402–414 px phone (it overflowed to the
  right); the tick's circle is drawn from 3 o'clock, as motion's pathLength does in the Make.

| 26 | Send — Step 8: Capitalize "Your" for "Your paperwork.." (addendum) | send-8: text edit on node 4:244, "Your paperwork is being reviewed" | (Figma text) |

Since 23/11 (phase 4, `../2026-11-23/`) Send plays the Visa securing after Transfer Progress, not after Face ID, and F&F
drops Sending your money; the 18/11 videos and shots here show the 18/11 placement.
