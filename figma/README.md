# Figma prototypes (Framelink pull)

Raw design data pulled with the Framelink MCP (`figma-developer-mcp`, `get_figma_data` + `download_figma_images`) on 2026-10-29, pulled again on 2026-11-10 (Figma edited 2026-11-09). This is the source of truth for the screens in `app.js`. Build from these files, never from memory or a screenshot guess.

| File key | Figma | Zone | Screens |
|---|---|---|---|
| `zSn01lZ2vy3a2kM9EDo6mD` | [Vietnam Pioneer Bank International Transfer](https://www.figma.com/design/zSn01lZ2vy3a2kM9EDo6mD/Untitled?node-id=0-1) | **SEND** | Home → Select purpose → Beneficiary details → Compliance documents → Transfer amount → Review transfer → Security authorization → Paperwork review → Transfer approved → Transfer tracking → Visa transfer success `22:134` (page 2 `4:358` = PDF export of the first 10) |
| `MPq4C2qjwzVdD2gYloQuUu` · nodes `2:*` | [VXBS receive](https://www.figma.com/design/MPq4C2qjwzVdD2gYloQuUu/Untitled?node-id=0-1) | **RECEIVE** | Home dashboard → Receive funds → Receiving details → Incoming transfer tracking → Transfer details → Funds arrived success (`11:*` = PDF copies) |
| `MPq4C2qjwzVdD2gYloQuUu` · nodes `15:*` | same file | **COLLECT** | Earnings dashboard → Upcoming payouts → Marketplace connectors → Multi-currency balances → Withdraw funds → FX conversion → Payout tracking → Settlement history |
| `h8rm8AicgWcMQ2FpMe0bDK` | [AFT me-to-you](https://www.figma.com/design/h8rm8AicgWcMQ2FpMe0bDK/Untitled?node-id=0-1) | RECEIVE (not built yet) | One storyboard frame `2:46793` (NovaBank, 414 wide): receiver lane 01–07 + 16–18, sender lane 08–15, recovery states A–E. Each step is a "Storyboard step" node; the PNGs include the device frame and step label. |
| `r2SArlDBWw4YrxIR7xcSVb` | [AFT me-to-me](https://www.figma.com/design/r2SArlDBWw4YrxIR7xcSVb/Untitled?node-id=0-1) | RECEIVE (not built yet) | 18 frames, 414×896 (XinChaoVietnam travel wallet): Welcome → Create account → Verify → Wallet created → Add Visa card → Card linked → Amount → Review → Issuer auth → Funding in progress → Funding success → Wallet home → Scan to pay → Review café payment → Payment success → Wallet activity → Funding detail → My Vietnam trip |

## Single source of truth

Everything the booth shows inside the phone comes from these files: copy, amounts, colours, sizes, icons and
photos. Code never restates a design value; when Figma changes, pull again and regenerate.

## The two AFT files come from .fig (Save local copy)

`fig/<key>.fig` are "Save local copy" exports of Drafts duplicates (node ids unchanged). `scripts/figma-fig/` turns
them into the same files an API pull gives, with no token or quota:

```bash
node scripts/figma-fig/fig2rest.mjs <key>            # fig/<key>.fig -> rest/<key>.json + fig/<key>.geometry.json
node scripts/figma-fig/framelink-offline.mjs <key>   # Framelink's own get_figma_data on rest/<key>.json -> <key>.json
node scripts/figma-fig/fig2svg.mjs <key>             # vector geometry -> assets/<key>/<name>.svg
node scripts/figma-fig/compare.mjs a.json b.json     # node-by-node Framelink diff
```

Checks (2026-11-10): Framelink run on the converted REST equals the API Framelink pull node for node (1013/1013
travel, 1527/1527 F&F). SVGs rebuilt from geometry match the 34 API-exported travel SVGs within 0.38 % of ink pixels
at 8x, colours equal. The 66 F&F SVGs are geometry exports (53 Framelink IMAGE-SVG names + 13 parts the generator
draws inside the two illustrations). Image fills: `assets/<key>/fills/` (travel only; F&F has none).

## Workflow: .fig + Framelink local (no Figma API)

The Figma REST API is not used any more (a View/Collab seat on these enterprise files gets ~20 requests a month).
To refresh a design: Duplicate to Drafts → File → Save local copy → put the file at `fig/<key>.fig`, then run the
four `scripts/figma-fig` commands above and `node scripts/gen/build-screens.mjs` + the verify harness.

| File | Source of `rest/<key>.json` |
|---|---|
| All four files | `.fig` (2026-11-10), converted by `fig2rest.mjs` |

Checks: Framelink on the converted REST equals the API Framelink pull for every node (SEND 1678, VXBS 1844, F&F 1527,
travel 1013). SEND node boxes match its official REST within 0.002 px. VXBS replaces the 2026-10-29 REST + copy patch,
which had missed 37 layout shifts of the 2026-11-09 edit (shorter "VISA" header and "Concept demo" footer).

- Travel-app SVGs, the SEND `22:134` icons and the travel photos (`assets/<key>/fills/`) were exported by the API on
  2026-11-10; everything else in `assets/` for the AFT files comes from the `.fig`.
- No file has prototype links; step order is read from the canvas and the copy.

## Layout

- `<fileKey>.json`: Framelink output. `nodes` is the tree, each node's `template` points into `elements` (layout, fills, text), and `globalVars.styles` holds the shared fills, text styles and layouts.
- `screens/<fileKey>/<nodeId>_<name>.png`: every top-level frame rendered at 1x (402 px wide), used to compare the build visually.
- `assets/<fileKey>/*.svg`: every `IMAGE-SVG` node (icons, route arcs, QR illustration), exported as SVG.

## Refresh

```bash
export FIGMA_API_KEY=figd_…            # PAT with File content: Read
node scripts/framelink.mjs get_figma_data '{"fileKey":"zSn01lZ2vy3a2kM9EDo6mD"}' > raw.json   # content[0].text is the JSON
IMAGE_DIR=$PWD/figma node scripts/framelink.mjs download_figma_images \
  '{"fileKey":"…","pngScale":1,"localPath":"screens/…","nodes":[{"nodeId":"2:4235","fileName":"2-4235_home.png"}]}'
```
