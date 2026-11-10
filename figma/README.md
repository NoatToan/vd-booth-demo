# Figma prototypes (Framelink pull)

Raw design data pulled with the Framelink MCP (`figma-developer-mcp`, `get_figma_data` + `download_figma_images`) on 2026-10-29, pulled again on 2026-11-10 (Figma edited 2026-11-09). This is the source of truth for the screens in `app.js`. Build from these files, never from memory or a screenshot guess.

| File key | Figma | Zone | Screens |
|---|---|---|---|
| `zSn01lZ2vy3a2kM9EDo6mD` | [Vietnam Pioneer Bank International Transfer](https://www.figma.com/design/zSn01lZ2vy3a2kM9EDo6mD/Untitled?node-id=0-1) | **SEND** | Home → Select purpose → Beneficiary details → Compliance documents → Transfer amount → Review transfer → Security authorization → Paperwork review → Transfer approved → Transfer tracking → Visa transfer success `22:134` (page 2 `4:358` = PDF export of the first 10) |
| `MPq4C2qjwzVdD2gYloQuUu` · nodes `2:*` | [VXBS receive](https://www.figma.com/design/MPq4C2qjwzVdD2gYloQuUu/Untitled?node-id=0-1) | **RECEIVE** | Home dashboard → Receive funds → Receiving details → Incoming transfer tracking → Transfer details → Funds arrived success (`11:*` = PDF copies) |
| `MPq4C2qjwzVdD2gYloQuUu` · nodes `15:*` | same file | **COLLECT** | Earnings dashboard → Upcoming payouts → Marketplace connectors → Multi-currency balances → Withdraw funds → FX conversion → Payout tracking → Settlement history |
| `h8rm8AicgWcMQ2FpMe0bDK` | [AFT me-to-you](https://www.figma.com/design/h8rm8AicgWcMQ2FpMe0bDK/Untitled?node-id=0-1) | RECEIVE (not built yet) | One storyboard frame `2:46793` (NovaBank, 414 wide): receiver lane 01–07 + 16–18, sender lane 08–15, recovery states A–E. Each step is a "Storyboard step" node; the PNGs include the device frame and step label. |
| `r2SArlDBWw4YrxIR7xcSVb` | [AFT me-to-me](https://www.figma.com/design/r2SArlDBWw4YrxIR7xcSVb/Untitled?node-id=0-1) | RECEIVE (not built yet) | 18 frames, 414×896 (XinChaoVietnam travel wallet): Welcome → Create account → Verify → Wallet created → Add Visa card → Card linked → Amount → Review → Issuer auth → Funding in progress → Funding success → Wallet home → Scan to pay → Review café payment → Payment success → Wallet activity → Funding detail → My Vietnam trip |

## 2026-11-10 pull: what is and is not from Figma REST

- The REST API (Tier 1) gives a View/Collab seat about 20 requests a month on these enterprise-plan files. Both tokens
  ran out on 2026-11-10 (`retry-after` 46 h and 111 h). Framelink JSON and PNG renders of all four files came through.
- `rest/zSn01lZ2vy3a2kM9EDo6mD.json` is a fresh REST pull.
- `rest/MPq4C2qjwzVdD2gYloQuUu.json` is the 2026-10-29 REST pull with the 2026-11-09 copy edits applied by
  `scripts/gen/patch-vxbs-2026-11-09.mjs` (Vietcombank → Vietnam Bank, "VXBS" removed). The script checks all 731 text
  nodes against the Framelink pull; the verify harness passes P1 against the new renders. Replace it with a real REST
  pull when quota allows.
- `assets/zSn01lZ2vy3a2kM9EDo6mD/x.svg` and `completed-check.svg` (frame `22:134`) were written by hand from the REST
  vector bounds and stroke (the image export was rate-limited). Pixel check against the render: P1 0.94 %.
- No file has prototype links; step order is still read from the canvas and the copy.

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
