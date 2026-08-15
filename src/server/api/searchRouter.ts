import { Router, Request, Response } from 'express';
import { SearchEngine } from '../search/SearchEngine.js';
import { SearchMode, StreamEventPayload } from '../../shared/types.js';

export function createSearchRouter(searchEngine: SearchEngine): Router {
  const router = Router();

  /**
   * GET /api/search (Standard non-streaming endpoint for backward compatibility)
   */
  router.get('/search', async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const mode = (req.query.mode as SearchMode) || 'local';
      const lang = typeof req.query.lang === 'string' ? req.query.lang : 'en';
      const page = parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10);
      const pageSize = parseInt(typeof req.query.pageSize === 'string' ? req.query.pageSize : '20', 10);

      const result = await searchEngine.search(q, { mode, lang, page, pageSize });
      res.json(result);
    } catch (err) {
      console.error('[searchRouter] Search API error:', err);
      res.status(500).json({ error: 'Search execution failed', message: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * GET /api/search/stream (Progressive Server-Sent Events SSE streaming endpoint)
   */
  router.get('/search/stream', async (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const mode = (req.query.mode as SearchMode) || 'local';
    const lang = typeof req.query.lang === 'string' ? req.query.lang : 'en';
    const page = parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10);
    const pageSize = parseInt(typeof req.query.pageSize === 'string' ? req.query.pageSize : '20', 10);

    // Set Server-Sent Events Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
    });

    const sendSseEvent = (payload: StreamEventPayload) => {
      if (clientDisconnected) return;
      res.write(`event: ${payload.event}\n`);
      res.write(`data: ${JSON.stringify(payload.data)}\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    };

    try {
      await searchEngine.searchProgressive(q, { mode, lang, page, pageSize }, (payload) => {
        sendSseEvent(payload);
      });
    } catch (err) {
      console.error('[searchRouter] SSE stream error:', err);
      sendSseEvent({
        event: 'error',
        data: { message: err instanceof Error ? err.message : 'Streaming search failed' },
      });
    } finally {
      if (!clientDisconnected) {
        res.end();
      }
    }
  });

  return router;
}
