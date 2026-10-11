import { askMiddleware } from '../server/askHandler.mjs';

export default function handler(req, res) {
  askMiddleware(req, res, () => {
    if (!res.headersSent) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: 'not_found' }));
    }
  });
}