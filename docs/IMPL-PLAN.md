# Implementation and verification plan: Figma rebuild of the booth demo (branch `figma-wip`)

What this is based on: `docs/DECISIONS.md` (D1–D5, Q1–Q8, binding), `docs/workflow.html` (the `ZONES` array is the functional spec), `figma/rest/*.json` (geometry and style ground truth) and `figma/screens/*` (pixel ground truth). Two agents run in parallel. CODING owns the app and VERIFY owns the harness. This file is the only contract between them.

## 0. What the data shows (and why it shapes the plan)

- **The data is clean.** Every fill is SOLID: no gradients, no images. Auto-layout is close to 100%. The only effects are 36 `DROP_SHADOW`s, all in RECEIVE/COLLECT. Only 3 nodes are rotated (2:6228 banknote, 2:6237, 2:6238 confetti). Every frame has cornerRadius 40. That is very favourable for a mechanical translation.
- **RECEIVE app frames are 874 tall; their twins are full height.** Each 2:* frame is fixed at 874 and its `Scroll content` (FILL) clips. Each PDF twin 11:* is HUG and full height, with **the same node count, the same pre-order structure and identical `characters`**. Within a pair, the i-th node of 2:* corresponds to the i-th node of 11:*.
- **The top-level children always follow one pattern:** header nodes, then one scroll node, then footer nodes. The scroll node is `Screen content` in SEND, `Scroll content` in RECEIVE and `Content` in COLLECT. That gives fixed header and footer for free.
- **SVG assets are exported once per name** with a hard-coded colour and size. Example: `check.svg` is #20785D at 15px, but its instances use 4 colours and 6 sizes. Icons must be recoloured and resized per instance.
- **Line heights must be explicit.** `lineHeightUnit` is `INTRINSIC_%` (Figma "auto", about 1.21em) on 202 texts. CSS must use `lineHeightPx` from the REST JSON, never `normal`.
- **The vendored Inter is missing glyphs the screens use.** `vendor/inter.css` is the Google Fonts subset, which lacks `→` U+2192, `↗` U+2197 and `≈` U+2248. All three appear in Figma text, so as things stand they would fall back to a system font.

## 1. Architecture

**Decision: a dev-time generator that compiles the Figma REST JSON into committed HTML and CSS, plus hand-written behaviours keyed by node id.** I agree with your lean, with one change: **the generator reads `figma/rest/*.json`, not the Framelink JSON.**

- **Why REST and not Framelink:** Framelink is lossy. It folds and rounds values, has no `lineHeightPx`, no `strokeAlign`, no rotation and no individual stroke weights. REST is also what the harness measures against.
- **Why a generator, not hand-authored screens:** hand-authoring 24 screens with about 2,400 nodes cannot reach 2px fidelity. The generator gives `data-node` annotations for free and is re-runnable when the designer fixes Q4 and Q6.
- **The circularity risk is covered.** Generator and harness read the same JSON, but the pixel layer compares against Figma's own PNGs, which neither agent produces.
- **No build step at deploy time.** Generated output is committed. There is no root `package.json`, so Vercel stays static.

### File layout

| Path | Owner | Content |
|---|---|---|
| `scripts/gen/build-screens.mjs` (+ `scripts/gen/lib/*.mjs`) | CODING | Pure Node, no dependencies. Run with `node scripts/gen/build-screens.mjs`. |
| `scripts/gen/screens.json` | CODING | CODING's own copy of the §2.4 manifest. |
| `scripts/gen/overrides.json` | CODING | Per-node patches, each entry `{node, css, reason}`. Reason is mandatory. Keep it under 30 entries; prefer fixing the general rule. |
| `screens/gen/screens.js` | GENERATED | `window.FIGMA_SCREENS = [{key:'send-1', zone, n, node, twin, title, h, html}]`. SVGs are inlined as strings. |
| `screens/gen/screens.css` | GENERATED | Deduplicated atomic classes `.g-<hash>`. |
| `screens/phone.css` | CODING | Phone host, `.kiosk`/`.solo` modes, scroll hint, hotspot ring, motion keyframes. |
| `screens/behaviors.js` | CODING | `window.BEHAVIORS[key] = {enter(root, api), go, auto}`. |
| `index.html`, `app.js` | CODING | Shell, rewritten in English only. |
| `vendor/fonts/InterVariable.woff2`, `vendor/inter.css` | CODING | Full Inter, one `@font-face` for weights 100–900. |
| `scripts/verify/**` | VERIFY | Harness, with its own `package.json`. |
| `docs/verify/report.html`, `docs/verify/report.json` | VERIFY | The report. Images go in `docs/verify/img/` (gitignored). |

### Generator translation rules

1. **One element per node.** Each Figma node becomes one `<div>`. TEXT becomes `<span style="display:block">`. An IMAGE-SVG root becomes an inline `<svg>`; its VECTOR children are not emitted.
2. **Auto-layout to flex:**
   - `layoutMode` maps to `display:flex` with `flex-direction` row or column.
   - `itemSpacing` maps to `gap`. Padding maps to padding.
   - `primaryAxisAlignItems` maps to `justify-content`; `counterAxisAlignItems` maps to `align-items`.
   - `layoutWrap:WRAP` maps to `flex-wrap`, with `counterAxisSpacing` as `row-gap`.
   - Every child gets `flex-shrink:0` and `box-sizing:border-box`.
3. **Sizing:**
   - FIXED: px width or height.
   - FILL: `flex:1 1 0; min-width:0` on the primary axis, `align-self:stretch` on the counter axis.
   - HUG: auto.
   - `layoutGrow:1` maps to `flex-grow:1`.
4. **Absolute positioning.** For `layoutPositioning:ABSOLUTE` or a parent with no layout mode: `position:absolute`, with left and top taken from the node's bounding box minus the parent's.
5. **Rotation:** `transform: rotate(<-rotation in degrees>)`. The REST value is radians and Figma's positive direction is counter-clockwise. Recover the unrotated w×h from the axis-aligned bounding box and centre it on that box.
6. **Fills:** stack them in reverse order as background. Fill `opacity` maps to rgba.
7. **Corners:** `cornerRadius` or `rectangleCornerRadii` maps to `border-radius`. `clipsContent` maps to `overflow:hidden`.
8. **Strokes never take layout space.** INSIDE: `box-shadow: inset 0 0 0 Wpx c`. Individual weights, for example `1px 0 0`, become inset box-shadows with offsets. CENTER: `outline: Wpx solid c; outline-offset: -W/2px`.
9. **Shadows:** `DROP_SHADOW` maps to `box-shadow`, appended after the stroke shadows.
10. **Text:**
    - Copy `font-size`, `font-weight` and `letter-spacing` exactly. `line-height` is `lineHeightPx` in px.
    - `textAutoResize`:
      - `WIDTH_AND_HEIGHT`: `white-space:nowrap`, so a different font cannot cause wrapping.
      - `HEIGHT`: fixed width and `white-space:pre-wrap`.
    - `textAlignHorizontal` maps to `text-align`.
    - `characterStyleOverrides` (15 nodes) become inner `<span>`s.
    - Copy `characters` verbatim. Escape HTML only, never "fix" anything.
11. **Icons.** Load `figma/assets/<key>/<slug(name)>.svg`. If the SVG uses a single colour, replace it with `currentColor`, set `color` from the instance's VECTOR stroke or fill in REST, and size the `<svg>` to the instance's bounding box. Multi-colour SVGs (route arcs, battery, the illustrative QR) are inlined verbatim. A missing asset is a generator error, not a silent skip.
12. **RECEIVE builds from the twin.** The generator walks the **11:* twin tree** for structure and sizes, so the scroll region hugs. Each element gets `data-node` = the 2:* id (mapped by pre-order index) and `data-twin` = the 11:* id.

### The phone host

- **Bezel:** `#phone` is a bezel with no notch, because the Figma frames already contain the status bar, Dynamic Island and home indicator.
- **Viewport:** `.viewport` is 402×874 CSS px with `border-radius:40px; overflow:hidden`. The whole phone is `transform: scale(1.08)` (434×944 on stage, about 970 with the bezel, top about 55, left 1010).
- **Kiosk mode** (`.fr` inside `.kiosk`):
  - The frame is `height:874px; display:flex; flex-direction:column`.
  - `[data-role=scroll]` is `flex:1 1 0; min-height:0; overflow-y:auto; scrollbar-width:none`.
  - Header and footer stay put because they are the scroll node's siblings in the column. No wrapper elements are added.
- **Solo mode:** the same DOM with natural heights, so the frame height equals the Figma or twin height.
- **Scroll hint** (`[data-fx].scroll-hint`):
  - It sits absolutely over the bottom of the scroll node: a fade plus a bouncing chevron.
  - It hides when `scrollTop + clientHeight >= scrollHeight - 4` and shows again when the user scrolls up.
  - On receive-2 it reads "Scroll to continue" until the CTA 2:5702 intersects the viewport.
  - It is not rendered when nothing overflows.
- **Hotspots:**
  - `behaviors.js` adds `data-a="next" data-hotspot` to the CTA's nearest button-frame ancestor of the §2.4 trigger node, and `data-a="back"` to the back node.
  - It may add attributes, classes and listeners only. **It must not change the final-state layout.**
  - The pulse ring is added after 4 s without a touch (as `[data-fx]`).
  - Everything else gets `:active` scale feedback only.
- **Motion rule: the generated DOM is the final Figma state.**
  - `enter()` may set temporary states (count-ups, unticked timeline steps, the Face ID scan, confetti) and must end exactly on the generated DOM and text.
  - Any added decoration carries `data-fx` and is removed or hidden when it finishes.
  - The spinner on receive-4 and the "Settlement running" state stay as in Figma.
- **Transitions:** a 320 ms horizontal push. The old screen goes to -30% with a dim, the new one comes in from 100%. Back plays it reversed.
- **Auto-advance:**
  - send-8 after 5000 ms.
  - collect-7 after its timeline, about 4000 ms.
  - send-7 Face ID: tapping the CTA or the Face ID block runs a 1500 ms scan, then advances.
  - All timers go through the existing `later()`/`clearTimers()`.
- **Kiosk shell** (keep `fit()`, particles, idle, reload, wake lock, `?fx=low`, `?zone`, `?idle`, `?qr`, `?goto`, keys F, Esc and 1/2/3):
  - **Remove:** the VI/EN switch, `L()`/`tx()` and `?lang`. Use `<html lang="en">`.
  - **Brand per Q7:** SEND "VISA Direct × TPBank"; RECEIVE and COLLECT "VISA / VXBS".
  - **Left rail:** the `ZONES[].t` titles. SEND has 10 items, so use a compact rail (20px font, 6px gap) that must fit within 1080.
  - **`#kiosk-next`** (`data-a="next"`) shows only on receive-3 and receive-5, and pulses after 4 s.
  - **`#kiosk-finish`** (`data-a="finish"`) shows only on collect-8.
  - **Done:** the last CTA goes to the Done screen. Copy is English. The QR default is `https://vd-booth-demo.vercel.app/` (still overridable with `?qr=`).
  - **Headlines:** the ones in `workflow.html`'s shell section.

## 2. The verification contract (binding on both agents)

### 2.1 Solo mode

`index.html?solo=<zone>-<n>` renders one phone screen and nothing else. `zone` is `send`, `receive` or `collect`; `n` is 1-based in `ZONES` order.

- **No kiosk at all.** Do not create the stage, canvas, rAF loop, idle, reload, wake lock or `fit()`. Add `html.solo`. Use `body{margin:0;background:#fff;width:402px}`.
- **The frame** `.fr[data-node][data-screen]` sits at (0,0), unscaled, at natural full height:
  - SEND: the frame height.
  - RECEIVE: the 11:* twin height.
  - COLLECT: 874.
- **No motion.** `enter()` is never called and no timers run. `.solo *, .solo *::before, .solo *::after {animation:none!important; transition:none!important}`. No `[data-fx]` element exists. Scrollbars are hidden.
- **`&clip=1`** renders the kiosk viewport instead (402×874, fixed header and footer, `scrollTop=0`). It is used for the 874 PNG check.
- **`&n=all`** is not needed.
- **Ready signal:** after `document.fonts.ready` and 2 rAFs, set `document.documentElement.dataset.ready = "1"`.
- **Determinism:** two loads must be byte-identical in screenshot.

### 2.2 DOM annotations

- **`data-node="<figma id>"`** goes on **every element the generator emits**. That is required for: every TEXT, every FRAME/RECTANGLE/ELLIPSE with a visible fill, stroke, radius or effect, every IMAGE-SVG root, and every top-level frame child. Each id appears **exactly once** in the solo DOM. RECEIVE elements also carry `data-twin="<11:* id>"`.
- **The frame root** carries `data-screen="<zone>-<n>"`. The scroll node carries `data-role="scroll"`.
- **Interaction:**
  - Hotspots: `[data-a="next"][data-hotspot]`. Back: `[data-a="back"]`. Kiosk: `#kiosk-next` and `#kiosk-finish`.
  - The phone is `#phone`, and `data-screen` gives the current key.
  - Done: `#qr`, whose `title` is the URL (qrcode.js sets it).
  - No `.lang` element may exist.
- **Non-Figma decoration** carries `data-fx`.
- **`window.VD.state()`** returns `{view:'idle'|'home'|'flow'|'done', zone, step, screen:'send-3', node:'2:4372'}`.

### 2.3 Harness runtime (VERIFY)

- **Server:** `scripts/verify/serve.mjs` serves the repo root on `http://127.0.0.1:4317`.
- **Browser:** `puppeteer-core` using `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, `headless:'new'`, DPR 1, flags `--force-color-profile=srgb --font-render-hinting=none --disable-lcd-text --hide-scrollbars`.
- **Solo viewport:** 402×H.
- **Network:** request interception aborts any URL that is not on 127.0.0.1:4317. The page must log 0 aborted requests and 0 console errors.

### 2.4 Screen manifest (VERIFY writes it as `scripts/verify/screens.json`; CODING mirrors it in `scripts/gen/screens.json`)

`go` lists the node the harness clicks (a TEXT node id) or `kiosk-next`, `kiosk-finish` or `auto:<min>-<max>ms`. `back` is the node the harness clicks for Back.

| key | node | reference PNG (full) | H | go | back |
|---|---|---|---|---|---|
| send-1 | 2:4235 | 2-4235_home.png | 1016 | 2:4268 New Transfer | – |
| send-2 | 2:4307 | 2-4307_select-purpose.png | 941 | 2:4366 | 2:4317 |
| send-3 | 2:4372 | 2-4372_beneficiary-details.png | 1057 | 2:4457 | 2:4382 |
| send-4 | 2:4463 | 2-4463_compliance-documents.png | 1450 | 2:4576 | 2:4473 |
| send-5 | 2:4582 | 2-4582_transfer-amount.png | 1109 | 2:4655 | 2:4592 |
| send-6 | 2:4661 | 2-4661_review-transfer.png | 1200 | 2:4741 | 2:4671 |
| send-7 | 2:4747 | 2-4747_security-authorization.png | 943 | 2:4803, then a scan of 1.2–3 s | 2:4757 |
| send-8 | 4:224 | 4-224_paperwork-review.png | 943 | auto:4000-7000 | 4:237 |
| send-9 | 4:281 | 4-281_transfer-approved.png | 943 | 4:331 | 4:294 |
| send-10 | 2:4809 | 2-4809_transfer-tracking.png | 1244 | 2:4913, then Done | 2:4819 |
| receive-1 | 2:5492 (twin 11:155) | 11-155_…png (clip: 2-5492_…png) | 1477 | 2:5527 | – |
| receive-2 | 2:5630 (11:308) | 11-308_…png | 1294 | 2:5702 (inside scroll) | 2:6342 |
| receive-3 | 2:5716 (11:407) | 11-407_…png | 1182 | kiosk-next | 2:6384 |
| receive-4 | 2:6011 (11:715) | 11-715_…png | 1235 | 2:6100 | 2:6426 |
| receive-5 | 2:6117 (11:840) | 11-840_…png | 1317 | kiosk-next | 2:6468 |
| receive-6 | 2:6212 (11:946) | 11-946_…png | 1141 | 2:6269, then Done | 2:6504 |
| collect-1 | 15:4975 | 15-4975_earnings-dashboard.png | 874 | 15:5027 | – |
| collect-2 | 15:5065 | 15-5065_upcoming-payouts.png | 874 | 15:5151 (tab Channels) | – |
| collect-3 | 15:5158 | 15-5158_marketplace-connectors.png | 874 | 15:5251 (tab Balances) | – |
| collect-4 | 15:5261 | 15-5261_multi-currency-balances.png | 874 | 15:5287 Withdraw | – |
| collect-5 | 15:5374 | 15-5374_withdraw-funds.png | 874 | 15:5433 | 15:5382 |
| collect-6 | 15:5440 | 15-5440_fx-conversion.png | 874 | 15:5489 | 15:5448 |
| collect-7 | 15:5496 | 15-5496_payout-tracking.png | 874 | auto:3000-6500 | 15:5504 |
| collect-8 | 15:5580 | 15-5580_settlement-history.png | 874 | kiosk-finish, then Done | – |

All reference PNGs are under `figma/screens/<fileKey>/`.

## 3. Verification layers and thresholds

Expected values come **only** from `figma/rest/*.json` and `figma/screens/*`, never from the generator's output. All boxes are relative to the frame origin. RECEIVE geometry and style come from the 11:* twin, looked up through `data-twin`.

| Layer | Check | Threshold | Gate |
|---|---|---|---|
| **T1 Coverage** | Every required node (see §2.2) is present exactly once | 100% | HARD |
| **T2 Text** | For each TEXT node, `textContent` of `[data-node]` === `characters` (exact, no normalisation) | 100% | HARD |
| **T3 Extra text** | No visible text in solo outside TEXT `[data-node]` elements (walk text nodes, skip zero-size or `visibility:hidden`) | 0 | HARD |
| **T4 Font used** | CDP `CSS.getPlatformFontsForNode` on every TEXT element reports only Inter (catches `→ ↗ ≈` fallback) | 100% | HARD |
| **G1 Geometry** | `getBoundingClientRect` vs `absoluteBoundingBox` − frame origin. Non-text: \|Δx\|,\|Δy\|,\|Δw\|,\|Δh\| ≤ 2px. TEXT: Δx, Δy, Δh ≤ 2px; Δw ≤ max(3px, 3%) for `WIDTH_AND_HEIGHT`, ≤ 2px for `HEIGHT`. Rotated nodes: AABB vs AABB at ≤ 3px. | ≥ 95% of nodes per screen | HARD |
| **G2 Gross geometry** | Same comparison, any axis | 100% within 8px; frame height ±4px | HARD |
| **G3 Parent-relative** | Same deltas relative to parent (finds the root of drift) | report only | advisory |
| **S1 Typography** | Computed `font-size` exact; `font-weight` exact; `line-height` ±0.5px vs `lineHeightPx`; `letter-spacing` ±0.05px; `color` ±2/255 per channel vs `fills[0]` × opacity; `text-align` (HEIGHT texts only) | 100% | HARD |
| **S2 Box style** | `background-color` ±2/255 and alpha ±0.02; `border-radius` ±0.5px; stroke colour ±2 and width ±0.5 (accept border, inset box-shadow or outline) | ≥ 98% of properties | HARD |
| **S3 Effects** | `box-shadow` present wherever there is a DROP_SHADOW, with values close | report only | advisory |
| **P1 Pixel (full)** | Screenshot 402×H vs the reference PNG. Flatten both onto #fff. `pixelmatch` with threshold 0.1, `includeAA:false`. Mismatch % = diff / (402·H). Diff PNG saved. | ≤ 3.0% | HARD |
| **P1 target** | Same measurement | ≤ 1.5% | advisory |
| **P2 Region** | Mismatch density inside each `[data-node]` box; offenders are boxes over 20% | top 10 listed | advisory |
| **P3 Clip** | `&clip=1` vs `2-*.png` (RECEIVE) and `15-*.png` (COLLECT) | ≤ 4.0% | advisory |
| **D Determinism** | Two solo screenshots of the same screen | 0 px | HARD |
| **E Flow** | See below | all pass | HARD |

**Why these thresholds:**
- **Pixel 3.0%:** Figma and Chrome rasterise glyphs differently, and the vendored Inter build may differ slightly from Figma's in advance widths (about ≤1%), which moves glyph edges on most text lines. On text-dense mobile screens that residue is typically 0.5–2%. A single wrong block, such as a 402×40 wrong-colour bar on a 1,000px screen, is about 4%, so 3% still catches real defects.
- **Geometry 95%:** frame-relative deltas cascade. One 3px text-height error shifts everything below it, hence the 95% bar plus the 100%-within-8px backstop, with G3 used to find the root cause.
- **Typography exact:** these values are copied, not measured, so there is no reason for any tolerance.

**E Flow / E2E** (1920×1080, real kiosk, network blocked). Each assertion is HARD.

1. Each zone, entered from home and also with `?zone=<z>`, runs through every step via the §2.4 `go`:
   - Before clicking, assert the clicked element has a `[data-a]` ancestor.
   - Puppeteer `click()` scrolls into view.
   - Assert the `#phone` `data-screen` sequence matches the manifest exactly, and the last step leads to `VD.state().view==='done'`.
   - Auto-advance must fire inside its window.
   - `#kiosk-next` or `#kiosk-finish` is visible only on its own steps.
2. **Back:** on every step with `back`, click it, assert the previous key, then go forward again.
3. **Inert elements:** on each step, click 3 TEXT nodes that have no `[data-a]` ancestor and assert the screen does not change.
4. **Scroll hint:** visible on entry for any screen whose scroll node overflows (all of SEND, all of RECEIVE). Hidden after scrolling to the bottom. Shows "Scroll to continue" on receive-2. Absent on COLLECT.
5. **Done:** decode the QR in the screenshot with jsQR. It must equal `https://vd-booth-demo.vercel.app/`, or the `?qr=` value when given.
6. **Idle:** with `?idle=6`, mid-journey and on Done, the kiosk returns to idle within 6–9 s.
7. **English only:** `html[lang=en]`, no `.lang`, and no Vietnamese diacritics (`/[À-ỹ]/`) in visible text outside `#phone`. Inside the phone, T2 already guarantees Figma text, which includes "Nguyễn Thị Linh".
8. **Offline:** 0 non-local requests. Fonts load from `vendor/`.
9. **`?fx=low`:** the canvas is present and one journey passes with 0 console errors.
10. **Screenshots:** one per step in `docs/verify/img/flow/`.

**Output:**
- `pnpm --dir scripts/verify verify` runs everything. The exit code is non-zero on any HARD failure.
- Flags: `--only send-4` and `--layer text|geom|style|pixel|flow`.
- **`docs/verify/report.json`:** `{commit, at, summary, screens:[{key, node, gates:{…}, text:{missing,extra}, geom:{n,passPct,worst[]}, style:{fails[]}, pixel:{pct,diff}, offenders[]}], flow:{steps[], fails[]}}`.
- **`docs/verify/report.html`:** one row per screen with figma | build | diff, gate badges and the top-10 offenders (id, name, expected vs actual).

## 4. Division of work

**CODING agent**
1. **Vendor the full Inter.** Download `InterVariable.woff2` (rsms/inter 4.x) once into `vendor/fonts/`, make `vendor/inter.css` a single `@font-face` for 100–900, and keep the old subsets only if still referenced. Use `font-optical-sizing:none` inside the phone, then keep or revert it based on P1 scores.
2. **Write the generator** (`scripts/gen/*`) to the §1 rules, then run it to produce `screens/gen/*`.
3. **Build the phone host** (`screens/phone.css`): kiosk and solo modes, scroll hint, hotspot ring, transitions.
4. **Write `screens/behaviors.js`:** hotspots, back, tabs, auto-advance and every motion listed in `ZONES[].motion`, following the motion rule.
5. **Rewrite the shell in `app.js` and `index.html`:** English only, Q7 brands, left rail, `#kiosk-next` and `#kiosk-finish`, Done and QR default, solo mode, `window.VD`. Update the parameter docs in the `index.html` comment and in `README.md` (drop `?lang`, add `?solo`).
6. **Self-check:** `node --check` on all JS, then run the harness read-only.
- **Must NOT:**
  - edit `scripts/verify/**`, the thresholds in this file, or `figma/**`;
  - hard-code Figma bounding boxes as absolute positions to get past G1, except in subtrees that Figma itself lays out absolutely (charts, the QR, the banknote illustration);
  - render screenshots or PNGs in place of the DOM;
  - touch `main` or `gh-pages`.

**VERIFY agent**
1. **Set up `scripts/verify/`:** `package.json` with `puppeteer-core`, `pngjs`, `pixelmatch` and `jsqr`, installed with `pnpm install`. Add `scripts/verify/node_modules` and `docs/verify/img/` to `.gitignore`. VERIFY owns `.gitignore`.
2. **Write `screens.json`** from §2.4.
3. **Write `lib/figma.mjs`:** frame lookup, required-node set, pre-order twin mapping for 2:* to 11:*, expected boxes, styles and text.
4. **Write `serve.mjs`, `solo.mjs` (T, G, S, P, D), `flow.mjs` (E) and `report.mjs`.**
5. **Write `--selftest`:** a reference PNG against itself must give 0%, and against a copy shifted by 1px must give more than 0%. A fake page with one wrong text must fail T2. Run this before trusting any report.
- **Must NOT:**
  - edit any app file (`index.html`, `app.js`, `screens/**`, `scripts/gen/**`, `vendor/**`);
  - take expected values from `screens/gen/*`;
  - loosen the thresholds;
  - mark a screen "skipped" when solo is missing; that counts as FAIL with the reason "no solo".

**Loop**
1. Phase 0 runs in parallel. VERIFY passes its selftest; CODING produces a first full generation.
2. VERIFY, or CODING running the harness, writes `report.json`.
3. CODING fixes the **top offenders by count of failing nodes across screens**, fixing general generator rules before `overrides.json`, then regenerates.
4. Re-verify, and commit each round on `figma-wip` as `verify: round N` (`report.json` only).
- **Stop when:** every HARD gate is green on all 24 screens and in E2E. Then a human looks over `report.html`, and the result is deployed to `vd-booth-demo-wip`.
- **Escalate when:** 5 rounds have run, or a round does not reduce the HARD failure count. Hand over a list of the remaining failures and their suspected causes.

## 5. Risks and how each is handled

| Risk | Handling |
|---|---|
| Missing glyphs (`→ ↗ ≈`) | Full InterVariable (task C1). T4 catches any fallback. |
| Inter version or optical size differs from Figma | Text-width tolerance and the 3% pixel threshold. If T/G/P show text widths systematically more than 1% too wide, CODING tries `font-optical-sizing:none` and keeps whichever scores better on P1. |
| Strokes shifting the layout | Strokes are never CSS borders (rule 8). |
| Same-name SVGs with other colours or sizes | Use `currentColor`, colour from the instance's REST vector, size from its bounding box. A missing asset is a hard generator error. |
| Rotated nodes (banknote, confetti) | Rotation rule 5. G1 compares AABB to AABB at 3px. |
| 216-rectangle illustrative QR (2:5775) | Absolute layout, or inline `illustrative-qr-code.svg` if Framelink collapsed it to IMAGE-SVG. It is decorative, so it must not use the real QR library. |
| RECEIVE: clipped 874 app frames vs full twins | Build from the twin and annotate with 2:* ids (rule 12). P3 checks the kiosk-clipped view against the 874 PNGs. |
| Status bar, Dynamic Island, home indicator | They are Figma nodes and are rendered as-is. The bezel has no notch. The times (9:41/9:49) come from the text. |
| Shadows (36, all very faint) | `box-shadow`. Advisory only (S3). |
| SEND 10-step rail overflowing 1080 | Compact rail. E2E screenshot review, plus an assert that `.left` bottom is at or above 1016. |
| Motion leaving the final state off-Figma | The motion rule, and solo never runs `enter()`. Add an E2E check: after every animated step settles, compare the `#phone` text against the solo text for that key. |
| Figma data refreshed later (Q4/Q6 fixes) | Re-pull, regenerate, re-verify. No hand-edited copy exists anywhere. |
| puppeteer-core not matching the local Chrome | Pin a recent puppeteer-core and pass `executablePath`. If launch fails, print the Chrome version. |

### Critical Files for Implementation
- /Users/Apple/Documents/Projects/NoatToan/vd-booth-demo/figma/rest/zSn01lZ2vy3a2kM9EDo6mD.json (SEND ground truth)
- /Users/Apple/Documents/Projects/NoatToan/vd-booth-demo/figma/rest/MPq4C2qjwzVdD2gYloQuUu.json (RECEIVE and COLLECT ground truth)
- /Users/Apple/Documents/Projects/NoatToan/vd-booth-demo/docs/workflow.html (`ZONES`: functional spec)
- /Users/Apple/Documents/Projects/NoatToan/vd-booth-demo/app.js (shell to rewrite: `FLOWS`, `show`/`draw`, idle, `fit`)
- /Users/Apple/Documents/Projects/NoatToan/vd-booth-demo/index.html (shell CSS, phone host, script and link wiring)
