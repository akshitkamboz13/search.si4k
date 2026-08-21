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
   * Helper to parse array parameters from query string (e.g. zims=a,b or zims[]=a&zims[]=b)
   */
  const parseQueryList = (val: unknown): string[] | undefined => {
    if (!val) return undefined;
    if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
    if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
    return undefined;
  };

  /**
   * Helper to parse per-search candidate limit overrides (candidateLimit=50 or limit=50)
   */
  const parseCandidateLimit = (req: Request): number | undefined => {
    const rawVal = req.query.candidateLimit || req.query.limit || req.body?.candidateLimit || req.body?.limit;
    if (!rawVal) return undefined;
    const parsed = parseInt(String(rawVal).trim(), 10);
    return !isNaN(parsed) && parsed > 0 ? parsed : undefined;
  };

  /**
   * GET /api/zims (Get all available ZIM files & distinct categories)
   */
  router.get('/zims', async (req: Request, res: Response) => {
    try {
      const sources = await searchEngine.getDiscoveredSources();
      const categorySet = new Set<string>();

      const zims = sources.map(s => {
        if (s.category) categorySet.add(s.category.toLowerCase());
        if (Array.isArray(s.categories)) {
          for (const c of s.categories) {
            if (c) categorySet.add(c.toLowerCase());
          }
        }
        return {
          id: s.id,
          zimName: s.zimName,
          name: s.name,
          title: s.title || s.name,
          category: s.category || 'general',
          categories: s.categories || [s.category || 'general'],
          description: s.description || '',
          lang: s.lang || 'en',
          basePriority: s.basePriority || 10,
        };
      });

      res.json({
        zims,
        categories: Array.from(categorySet).sort(),
      });
    } catch (err) {
      console.error('[searchRouter] ZIM discovery error:', err);
      res.status(500).json({ error: 'Failed to retrieve available ZIM files' });
    }
  });

  /**
   * GET /api/zims/names (Lightweight API returning array of ZIM file names only)
   */
  router.get('/zims/names', async (_req: Request, res: Response) => {
    try {
      const sources = await searchEngine.getDiscoveredSources();
      const zimNames = Array.from(new Set(sources.map(s => s.zimName).filter(Boolean))).sort();
      res.json({
        total: zimNames.length,
        zimNames,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve ZIM names' });
    }
  });

  /**
   * GET /api/categories (Get active categories with source counts)
   */
  router.get('/categories', async (_req: Request, res: Response) => {
    try {
      const sources = await searchEngine.getDiscoveredSources();
      const categoryCounts: Record<string, number> = {};

      sources.forEach(s => {
        const catList = Array.isArray(s.categories) && s.categories.length > 0 
          ? s.categories 
          : [s.category || 'general'];
        catList.forEach(c => {
          if (!c) return;
          const lower = c.toLowerCase().trim();
          categoryCounts[lower] = (categoryCounts[lower] || 0) + 1;
        });
      });

      const categories = Object.entries(categoryCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        totalCategories: categories.length,
        categories,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve categories' });
    }
  });

  /**
   * GET /api/search/category/:category (Search query specifically within a target category)
   */
  router.get('/search/category/:category', async (req: Request, res: Response) => {
    try {
      const category = req.params.category;
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const autoDetection = envDetector.detectEnvironment(req);
      const mode = (req.query.mode as SearchMode) || autoDetection.mode;
      const lang = typeof req.query.lang === 'string' ? req.query.lang : 'en';
      const page = parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10);
      const pageSize = parseInt(typeof req.query.pageSize === 'string' ? req.query.pageSize : '20', 10);
      const zims = parseQueryList(req.query.zims);

      const candidateLimit = parseCandidateLimit(req);
      const result = await searchEngine.search(q, {
        mode,
        lang,
        page,
        pageSize,
        candidateLimit,
        zims,
        categories: [category],
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Category search failed', message: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * GET/POST /api/search/zims (Search specifically across selected 1+ ZIM files e.g. 4 @ ZIMs)
   */
  const handleZimSearch = async (req: Request, res: Response) => {
    try {
      const isPost = req.method === 'POST';
      const body = isPost ? (req.body || {}) : {};

      const q = typeof body.q === 'string' ? body.q : (typeof req.query.q === 'string' ? req.query.q : '');
      const rawZims = isPost ? body.zims : req.query.zims;
      const zims = parseQueryList(rawZims);

      if (!zims || zims.length === 0) {
        res.status(400).json({ error: 'Missing zims parameter. Provide at least 1 ZIM file name.' });
        return;
      }

      const autoDetection = envDetector.detectEnvironment(req);
      const mode = (body.mode || req.query.mode || autoDetection.mode) as SearchMode;
      const lang = body.lang || req.query.lang || 'en';
      const page = parseInt(body.page || req.query.page || '1', 10);
      const pageSize = parseInt(body.pageSize || req.query.pageSize || '20', 10);
      const candidateLimit = parseCandidateLimit(req);

      const result = await searchEngine.search(q, {
        mode,
        lang,
        page,
        pageSize,
        candidateLimit,
        zims,
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Multi-ZIM search failed', message: err instanceof Error ? err.message : String(err) });
    }
  };

  router.get('/search/zims', handleZimSearch);
  router.post('/search/zims', handleZimSearch);

  /**
   * POST /api/search/mixed (Advanced multi-ZIM & category index mixing & ranking API)
   */
  router.post('/search/mixed', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const q = typeof body.q === 'string' ? body.q : '';
      const zims = parseQueryList(body.zims);
      const categories = parseQueryList(body.categories);
      const autoDetection = envDetector.detectEnvironment(req);
      const mode = (body.mode || autoDetection.mode) as SearchMode;
      const lang = body.lang || 'en';
      const page = parseInt(body.page || '1', 10);
      const pageSize = parseInt(body.pageSize || '20', 10);
      const candidateLimit = parseCandidateLimit(req);

      const result = await searchEngine.search(q, {
        mode,
        lang,
        page,
        pageSize,
        candidateLimit,
        zims,
        categories,
      });

      res.json({
        mixingStrategy: 'Multi-ZIM Cross-Source Ranking & Interleaving',
        targetZims: zims || ['All relevant sources'],
        targetCategories: categories || ['All active categories'],
        ...result,
      });
    } catch (err) {
      res.status(500).json({ error: 'Index mixing search failed', message: err instanceof Error ? err.message : String(err) });
    }
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
      const zims = parseQueryList(req.query.zims);
      const categories = parseQueryList(req.query.categories);
      const candidateLimit = parseCandidateLimit(req);

      const result = await searchEngine.search(q, { mode, lang, page, pageSize, candidateLimit, zims, categories });
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
    const zims = parseQueryList(req.query.zims);
    const categories = parseQueryList(req.query.categories);
    const candidateLimit = parseCandidateLimit(req);

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
          candidateLimit,
          zims,
          categories,
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
