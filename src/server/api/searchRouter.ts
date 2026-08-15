import { Router, Request, Response } from 'express';
import { SearchEngine } from '../search/SearchEngine.js';
import { SearchMode } from '../../shared/types.js';

export function createSearchRouter(searchEngine: SearchEngine): Router {
  const router = Router();

  router.get('/search', async (req: Request, res: Response) => {
    try {
      const query = (req.query.q as string) || '';
      const rawMode = (req.query.mode as string) || 'local';
      const page = parseInt((req.query.page as string) || '1', 10);
      const pageSize = parseInt((req.query.pageSize as string) || '20', 10);
      const lang = (req.query.lang as string) || 'en';

      const mode: SearchMode = rawMode === 'online' ? 'online' : 'local';

      if (!query.trim()) {
        return res.json({
          query: '',
          mode,
          results: [],
          sources: {},
          pagination: {
            page: 1,
            pageSize,
            totalResults: 0,
            hasMore: false,
          },
          meta: {
            total: 0,
            executionTimeMs: 0,
            providers: searchEngine.getRegisteredProviders(),
          },
        });
      }

      const response = await searchEngine.search(query, {
        mode,
        lang,
        page: isNaN(page) ? 1 : page,
        pageSize: isNaN(pageSize) ? 20 : pageSize,
      });

      return res.json(response);
    } catch (err) {
      console.error('[searchRouter] Error executing search:', err);
      return res.status(500).json({
        error: 'Internal Search Error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
