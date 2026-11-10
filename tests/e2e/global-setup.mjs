import fs from 'node:fs';
import { OUT } from './lib.mjs';
export default () => { fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true }); };
