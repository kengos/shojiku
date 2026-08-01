// Dev-only Vite middleware serving the assembled `dist/data/` tree at /data,
// so `vite dev` (make gui-dev) fetches the same catalog/presets/fonts/wasm
// files the built site serves statically. Production builds never load this
// (`apply: 'serve'`); the assembled tree ships inside dist/. A miss inside
// /data answers 404 (never the SPA index.html fallback, which would hand the
// app HTML where it expects JSON/bytes).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, normalize, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.yml': 'text/yaml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

export function devDataPlugin(): Plugin {
  return {
    name: 'shojiku-dev-data',
    apply: 'serve',
    configureServer(server) {
      const dataDir = resolve(server.config.root, 'dist', 'data');
      server.middlewares.use('/data', (req, res) => {
        const raw = (req.url ?? '').split('?', 1)[0] ?? '';
        const rel = normalize(decodeURIComponent(raw)).replace(/^[/\\]+/, '');
        const file = resolve(dataDir, rel);
        if (file !== dataDir && !file.startsWith(dataDir + sep)) {
          res.statusCode = 403;
          res.end('forbidden');
          return;
        }
        if (!existsSync(dataDir)) {
          res.statusCode = 503;
          res.end('dist/data missing — run `pnpm --filter @shojiku/designer-app assemble` first');
          return;
        }
        if (!existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
        res.setHeader('content-type', type);
        createReadStream(file).pipe(res);
      });
    },
  };
}
