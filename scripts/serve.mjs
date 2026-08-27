// Static dev server for mscore-web-engine.
//
// Serves the repository root so the demo (examples/demo/index.html) can reach
// the engine (engine/viewer.html) and its assets (wasm / js / sf3) over plain
// HTTP. Handles the things a bare `python -m http.server` gets wrong:
//   - application/wasm MIME (required for WebAssembly.instantiateStreaming)
//   - Range requests for the 82 MB wasm / 51 MB sf3
//   - URL-encoded filenames such as sound/MS%20Basic.sf3
//
// Usage: node scripts/serve.mjs [port]   (default 8000)

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.argv[2] || 8000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.sf3': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mscx': 'application/xml; charset=utf-8',
  '.mscz': 'application/octet-stream',
  '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    // Resolve inside root only.
    const rel = normalize(pathname).replace(/^([/\\])+/, '');
    const filePath = join(root, rel);
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    const info = await stat(filePath);
    if (!info.isFile()) {
      res.writeHead(404).end('not found');
      return;
    }

    const mime = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;

    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      if (m) {
        const start = Number(m[1]);
        const end = m[2] ? Number(m[2]) : info.size - 1;
        if (start < info.size && end >= start) {
          const endClamped = Math.min(end, info.size - 1);
          const buf = await readFile(filePath);
          res.writeHead(206, {
            'Content-Type': mime,
            'Content-Length': endClamped - start + 1,
            'Content-Range': `bytes ${start}-${endClamped}/${info.size}`,
            'Accept-Ranges': 'bytes',
          });
          res.end(buf.subarray(start, endClamped + 1));
          return;
        }
      }
      res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
      return;
    }

    const buf = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': info.size,
      'Accept-Ranges': 'bytes',
    });
    res.end(buf);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404).end('not found: ' + req.url);
    } else {
      console.error('[serve]', req.url, err);
      res.writeHead(500).end('internal error');
    }
  }
});

server.listen(port, () => {
  console.log(`mscore-web-engine dev server: http://127.0.0.1:${port}/`);
  console.log(`  demo:  http://127.0.0.1:${port}/examples/demo/`);
  console.log(`  engine: http://127.0.0.1:${port}/engine/viewer.html`);
});
