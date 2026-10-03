/* Tiny HTTP helpers shared by the AskMySchool and SnapHomework
   endpoints. No framework: the surface is two functions. */

export function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export class PayloadTooLarge extends Error {
  constructor() {
    super('payload_too_large');
    this.name = 'PayloadTooLarge';
  }
}

export function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new PayloadTooLarge());
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Logs the shape of a failure, never credentials or payloads. */
export function logFailure(label, error) {
  const message = error instanceof Error ? error.message : String(error);
  const safe = message
    .replace(/key=[\w-]+/gi, 'key=***')
    .replace(/[A-Za-z0-9_-]{30,}/g, '***')
    .slice(0, 300);
  console.error(`[schoolmind-ai] ${label} failed: ${safe}`);
}
