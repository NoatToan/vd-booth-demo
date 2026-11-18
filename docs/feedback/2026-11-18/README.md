# Feedback 18/11/2026 (phase 2)

Natalie Liew, 18/11 10:48, on the 18/11 update; Hoa Nguyen, 18/11 10:54. Live page with before / after:
<https://vd-booth-demo.vercel.app/test-changes/#item-17> (items 17–20).

| # | Feedback (as written) | Status | Change | Cause |
|---|---|---|---|---|
| 17 | Across all pages - remove the animated moving streaks in the background | On hold | none. Hoa: "phần này em giữ nguyên giúp chị nhé, chị sẽ trao đổi với bạn" | Our shell design: the money routes over the KV (`#bg` canvas, app.js) and the attract screen's 9 streaks (`.kv-streaks`) |
| 18 | Send - Step 11 - Change Visa Direct logo to Visa logo | Done | send-11: "Direct" (node 22:149) removed, `client-edits.json` | 16/11 item 7 kept Figma's "Direct" next to the new Visa logo |
| 19 | Receive (Friends & family) - Step 13 - Remove "Secure" after Visa logo | Done | family-13: node 2:47795 text "VISA" before its visaMark, `client-edits.json` | 16/11 item 7 kept Figma's "Secure" |
| 20 | It auto-directs back to the homepage after some inactivity - but the duration is pretty short | Done | `IDLE_MS` 60 → 180 s; the last 15 s show a "Still there?" countdown, a tap keeps the step (app.js `idleWarn`, `#still` in index.html) | 60 s was our own default |

Evidence: `before/` (production at e092f6c), `after-local/`, `after-deployed/`, boxes in `annotations.json`.
The idle shots run the page clock forward with no touch on SEND step 3, default timeout (no `?idle=`):
before, the kiosk is back on the attract screen at 61 s; after, the step is still there at 61 s, the countdown shows
at 166 s, the attract screen at 181 s, and a tap at 170 s keeps the step.
