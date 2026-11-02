import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  const rel = p.replace(/^\/(reverb-calc|reverbtime)(?=\/|$)/, '') || '/';
  const file = normalize(join(root, rel === '/' ? 'index.html' : rel));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
}).listen(5173, '127.0.0.1');
