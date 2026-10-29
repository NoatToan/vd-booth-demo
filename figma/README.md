# Figma prototypes (Framelink pull)

Raw design data pulled with the Framelink MCP (`figma-developer-mcp`, `get_figma_data` + `download_figma_images`) on 2026-10-29. This is the source of truth for the screens in `app.js`. Build from these files, never from memory or a screenshot guess.

| File key | Figma | Zone | Screens |
|---|---|---|---|
| `zSn01lZ2vy3a2kM9EDo6mD` | [TPBank International Transfer](https://www.figma.com/design/zSn01lZ2vy3a2kM9EDo6mD/Untitled?node-id=0-1) | **SEND** | Home → Select purpose → Beneficiary details → Compliance documents → Transfer amount → Review transfer → Security authorization → Paperwork review → Transfer approved → Transfer tracking (page 2 `4:358` = PDF export of the same 10) |
| `MPq4C2qjwzVdD2gYloQuUu` · nodes `2:*` | [VXBS receive](https://www.figma.com/design/MPq4C2qjwzVdD2gYloQuUu/Untitled?node-id=0-1) | **RECEIVE** | Home dashboard → Receive funds → Receiving details → Incoming transfer tracking → Transfer details → Funds arrived success (`11:*` = PDF copies) |
| `MPq4C2qjwzVdD2gYloQuUu` · nodes `15:*` | same file | **COLLECT** | Earnings dashboard → Upcoming payouts → Marketplace connectors → Multi-currency balances → Withdraw funds → FX conversion → Payout tracking → Settlement history |

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
