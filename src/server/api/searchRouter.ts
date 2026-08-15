import { Router, Request, Response } from 'express';
import { SearchEngine } from '../search/SearchEngine.js';
import { SourceRelevance } from '../search/SourceRelevance.js';
import { EnvironmentDetector } from '../search/EnvironmentDetector.js';
import { SearchMode, StreamEventPayload } from '../../shared/types.js';
import { config } from '../config.js';

export function createSearchRouter(searchEngine: SearchEngine): Router {
  const router = Router();
  const sourceRelevance = new SourceRelevance();
  const envDetector = new EnvironmentDetector();

  /**
   * GET /api/environment (Automatic Environment Detection API)
   */
  router.get('/environment', (req: Request, res: Response) => {
    const detection = envDetector.detectEnvironment(req);
    res.json({
      environment: detection.environment,
      mode: detection.mode,
      publicUrl: detection.publicUrl,
      clientIp: detection.clientIp,
      isDevOverride: detection.isDevOverride,
    });
  });

  /**
   * GET /api/debug/resources (Development-only Resource & Memory Diagnostics API)
   */
  router.get('/debug/resources', (req: Request, res: Response) => {
    if (config.nodeEnv !== 'development') {
      res.status(404).json({ error: 'Endpoint not available in production' });
      return;
    }

    const mem = process.memoryUsage();
    const toMB = (bytes: number) => parseFloat((bytes / (1024 * 1024)).toFixed(2));

    res.json({
      process: {
        rssMB: toMB(mem.rss),
        heapUsedMB: toMB(mem.heapUsed),
        heapTotalMB: toMB(mem.heapTotal),
        externalMB: toMB(mem.external),
        arrayBuffersMB: toMB(mem.arrayBuffers || 0),
      },
      cache: {
        entries: searchEngine.searchCache.size,
        estimatedMemoryMB: searchEngine.searchCache.estimatedMemoryMB,
      },
      search: {
        activeSessions: searchEngine.getActiveSessionsCount(),
        activeProviders: searchEngine.getRegisteredProviders().length,
        activeSSEConnections: searchEngine.getActiveSSEConnectionsCount(),
      },
    });
  });

  /**
   * GET /api/search (Standard non-streaming endpoint for backward compatibility)
   */
  router.get('/search', async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const autoDetection = envDetector.detectEnvironment(req);
      const mode = (req.query.mode as SearchMode) || autoDetection.mode;
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
    const autoDetection = envDetector.detectEnvironment(req);
    const mode = (req.query.mode as SearchMode) || autoDetection.mode;
    const lang = typeof req.query.lang === 'string' ? req.query.lang : 'en';
    const page = parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10);
    const pageSize = parseInt(typeof req.query.pageSize === 'string' ? req.query.pageSize : '20', 10);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    searchEngine.incrementSSECount();

    const abortController = new AbortController();
    let clientDisconnected = false;

    req.on('close', () => {
      clientDisconnected = true;
      abortController.abort();
      searchEngine.decrementSSECount();
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
      await searchEngine.searchProgressive(
        q,
        {
          mode,
          lang,
          page,
          pageSize,
          signal: abortController.signal,
          isAborted: () => clientDisconnected || abortController.signal.aborted,
        },
        (payload) => {
          sendSseEvent(payload);
        }
      );
    } catch (err) {
      if (!clientDisconnected) {
        console.error('[searchRouter] SSE stream error:', err);
        sendSseEvent({
          event: 'error',
          data: { message: err instanceof Error ? err.message : 'Streaming search failed' },
        });
      }
    } finally {
      if (!clientDisconnected) {
        searchEngine.decrementSSECount();
        res.end();
      }
    }
  });

  /**
   * GET /api/search/debug (Development-only Explain/Debug Routing API)
   */
  router.get('/search/debug', async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const allDiscovered = await searchEngine.getDiscoveredSources();
      const relevanceResult = sourceRelevance.selectRelevantSources(q, allDiscovered, 20);

      res.json({
        query: q,
        categories: relevanceResult.intents.map(i => ({
          name: i.name,
          score: i.score,
          priority: i.priority,
          matchedKeywords: i.matchedKeywords,
        })),
        sources: relevanceResult.scoredRanks.map(r => ({
          zimName: r.source.zimName,
          title: r.source.name,
          effectivePriority: r.effectivePriority,
          keywordPriority: r.keywordPriority,
          basePriority: r.basePriority,
          intersectionBonus: r.intersectionBonus,
          matchedCategories: r.matchedCategories,
          matchedKeywords: r.matchedKeywords,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: 'Debug routing failed', message: String(err) });
    }
  });

  return router;
}
