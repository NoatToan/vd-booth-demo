import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { OUT, REPO, FIGMA_BUILD } from './lib.mjs';
export default () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  // the screens exactly as in Figma (no client palette), for the pixel comparison of recoloured zones
  execFileSync('node', [path.join(REPO, 'scripts/gen/build-screens.mjs'), '--figma', '--out', FIGMA_BUILD]);
};
