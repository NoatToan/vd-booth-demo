// Static server for the e2e run (repo root on 127.0.0.1:4320), reusing the verify harness's server.
import { startServer } from '../../scripts/verify/serve.mjs';
await startServer({ port: 4320 });
console.log('e2e server on http://127.0.0.1:4320');
