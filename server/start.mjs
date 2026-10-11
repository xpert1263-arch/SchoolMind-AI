import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { askMiddleware } from './askHandler.mjs';
import { describeConfigForLog, hasTelegramToken } from './env.mjs';
import { describeProviders } from './ai/index.mjs';
import { startTelegramBridge } from './telegram.mjs';

/* ------------------------------------------------------------------
   SchoolMind in production — one Node process.

   In development the API is mounted inside Vite (server/vitePlugin.mjs)
   so that one command serves both halves. A hosted container has no
   Vite, so this file does the same two jobs directly:

     /api/*   the same `askMiddleware` the dev server uses, so there
              is exactly one implementation of every endpoint and the
              deployed build cannot drift from the one being demoed
     /*       the built client from dist/, with a single-page fallback
              so a deep link like /teacher/pulse survives a refresh

   The secrets stay where they have always been: read from the
   environment by server/env.mjs, used only inside this process, never
   written into the client bundle.
   ------------------------------------------------------------------ */

const PORT = Number(process.env.PORT) || 8080;
/* Containers route to the published port on every interface, so
   binding to localhost would make the service unreachable. */
const HOST = process.env.HOST || '0.0.0.0';

const CLIENT_ROOT = resolve(process.cwd(), 'dist');
const INDEX_HTML = join(CLIENT_ROOT, 'index.html');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** Hashed build assets never change; index.html must not be cached or
 *  a redeploy leaves browsers on the previous bundle. */
function cacheHeaderFor(pathname) {
  return pathname.startsWith('/assets/')
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
}

/**
 * Resolves a request path to a file inside dist/, or null.
 *
 * The normalise-and-prefix check is what stops `/../.env` from
 * escaping the public directory — the one way a static server leaks
 * a secret it was never asked for.
 */
function safeLocalPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const candidate = resolve(join(CLIENT_ROOT, normalize(decoded)));
  if (candidate !== CLIENT_ROOT && !candidate.startsWith(CLIENT_ROOT + sep)) return null;
  return candidate;
}

async function sendFile(res, filePath, pathname, status = 200) {
  const body = await readFile(filePath);
  res.statusCode = status;
  res.setHeader('Content-Type', MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', cacheHeaderFor(pathname));
  res.end(body);
}

const server = createServer((req, res) => {
  const pathname = (req.url ?? '/').split('?')[0];

  /* A liveness probe that touches no provider and spends nothing. */
  if (pathname === '/healthz') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true, service: 'schoolmind' }));
    return;
  }

  if (pathname.startsWith('/api/')) {
    /* Same middleware as the dev server; the `next` it is handed is
       the 404 for an API path nothing claimed. */
    askMiddleware(req, res, () => {
      if (res.headersSent) return;
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: 'not_found' }));
    });
    return;
  }

  void (async () => {
    try {
      const filePath = safeLocalPath(pathname);
      if (filePath) {
        try {
          await sendFile(res, filePath, pathname);
          return;
        } catch {
          /* Not a file on disk: fall through to the SPA entry. */
        }
      }
      /* Every other path is a client route, so the app decides what
         it means — including its own 404 screen. */
      await sendFile(res, INDEX_HTML, '/index.html', 200);
    } catch {
      if (res.headersSent) return;
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('SchoolMind: client build not found. Run `npm run build` first.');
    }
  })();
});

server.listen(PORT, HOST, () => {
  const { aiConfigured, webSearchEnabled, geminiModel } = describeConfigForLog();

  console.info(`[schoolmind] listening on http://${HOST}:${PORT}`);

  void describeProviders().then((providers) => {
    /* Model names belong in a server log and nowhere else. */
    console.info(`[schoolmind-ai] providers: ${providers}${geminiModel ? ` [${geminiModel}]` : ''}`);
    if (!aiConfigured) {
      console.info(
        '[schoolmind-ai] no AI provider configured — school-data answers and SchoolMind fallbacks still work.',
      );
    }
    console.info(
      webSearchEnabled
        ? '[schoolmind-ai] live web search available. A search must actually run before any answer is treated as current.'
        : '[schoolmind-ai] no live web search mechanism configured — current-information questions will be declined rather than guessed.',
    );
  });

  if (!hasTelegramToken) {
    console.info(
      '[schoolmind-telegram] TELEGRAM_BOT_TOKEN not set — Parent Connect stores records but cannot link or deliver.',
    );
    return;
  }
  void startTelegramBridge();
});

/* Containers stop by signal; close the listener so in-flight requests
   finish instead of being cut off mid-answer. */
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.info(`[schoolmind] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  });
}
