// Minimal stdio MCP client for figma-developer-mcp (Framelink).
// Usage: FIGMA_API_KEY=figd_… node scripts/framelink.mjs get_figma_data '{"fileKey":"…"}'
//        node scripts/framelink.mjs list   (prints the tools and their schemas)
import { spawn } from 'node:child_process'
const [,, method, argsJson] = process.argv
const p = spawn('npx', ['-y', 'figma-developer-mcp@latest', '--stdio', '--json', ...(process.env.IMAGE_DIR ? ['--image-dir=' + process.env.IMAGE_DIR] : [])], { env: process.env, stdio: ['pipe', 'pipe', 'inherit'] })
let buf = '', id = 0; const pending = {}
p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; try { const m = JSON.parse(line); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id] } } catch {} } })
const rpc = (method, params) => new Promise(r => { const i = ++id; pending[i] = r; p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n') })
await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'cli', version: '1' } })
p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
const res = method === 'list' ? await rpc('tools/list', {}) : await rpc('tools/call', { name: method, arguments: JSON.parse(argsJson) })
process.stdout.write(JSON.stringify(res.result ?? res.error))
p.kill()
