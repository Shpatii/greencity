// Static preview of the export with HTTP range requests, which the base map needs
// (public/basemap/heilbronn.pmtiles is read in ranges; `python -m http.server` cannot do that),
// and the response headers of vercel.json, so the preview runs under the production CSP.
//
//   node scripts/serve.mjs [dir = out] [port = 3000]
import { createServer } from 'node:http';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] ?? 'out');
const port = Number(process.argv[3] ?? 3000);
// vercel.json sources here are plain regular expressions (no :param syntax).
const vercel = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'vercel.json'), 'utf8'));
const headerRules = vercel.headers.map((r) => ({ re: new RegExp(`^${r.source}$`), headers: r.headers }));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.geojson': 'application/geo+json',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.pbf': 'application/x-protobuf',
  '.pmtiles': 'application/octet-stream',
};

function stat(file) {
  try {
    return statSync(file);
  } catch {
    return null;
  }
}

function send(res, status, file, headers = {}, range) {
  res.writeHead(status, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', ...headers });
  createReadStream(file, range).pipe(res);
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  for (const rule of headerRules) {
    if (rule.re.test(path)) rule.headers.forEach(({ key, value }) => res.setHeader(key, value));
  }
  const file = join(root, normalize(path));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  let info = stat(file);
  if (info?.isDirectory()) {
    if (!path.endsWith('/')) {
      res.writeHead(308, { Location: `${path}/` }).end(); // trailingSlash export: /map -> /map/
      return;
    }
    info = stat(join(file, 'index.html'));
    if (info) return send(res, 200, join(file, 'index.html'), { 'Content-Length': info.size });
  }
  if (!info?.isFile()) return send(res, 404, join(root, '404.html'));

  const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (!match) return send(res, 200, file, { 'Content-Length': info.size });
  const start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
  if (start > end || start >= info.size) {
    res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
    return;
  }
  send(res, 206, file, { 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${info.size}` }, { start, end });
}).listen(port, () => console.log(`Serving ${root} on http://localhost:${port}`));
