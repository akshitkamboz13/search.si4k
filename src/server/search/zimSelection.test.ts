import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SearchEngine } from './SearchEngine.js';
import { SearchProvider } from './types.js';
import { SearchResult, SearchSourceConfig } from '../../shared/types.js';

describe('Multi-ZIM Selection (@) & Category Index Mixing Tests', () => {
  const mockSources: SearchSourceConfig[] = [
    {
      id: 'zim-wikipedia-en',
      zimName: 'wikipedia_en_all',
      name: 'Wikipedia (EN)',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 50,
      category: 'encyclopedia',
      enabled: true,
      keywords: ['wiki', 'wikipedia'],
    },
    {
      id: 'zim-wikihow-en',
      zimName: 'wikihow_en_all',
      name: 'wikiHow (EN)',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 45,
      category: 'guides',
      enabled: true,
      keywords: ['how', 'guide', 'wikihow'],
    },
    {
      id: 'zim-ifixit-en',
      zimName: 'ifixit_en_all',
      name: 'iFixit (EN)',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 40,
      category: 'repair',
      enabled: true,
      keywords: ['fix', 'repair'],
    },
  ];

  class MockKiwixProvider implements SearchProvider {
    name = 'kiwix';

    async search(query: string): Promise<SearchResult[]> {
      return [];
    }

    async searchZimSource(source: SearchSourceConfig, query: string): Promise<SearchResult[]> {
      return [
        {
          id: `res-${source.zimName}-1`,
          sourceId: source.id,
          title: `Article from ${source.name} for ${query}`,
          description: `Description from ${source.zimName}`,
          url: `http://localhost/${source.zimName}/article`,
          source: source.name,
          provider: 'kiwix',
          type: 'article',
          zimName: source.zimName,
        },
      ];
    }
  }

  it('restricts search sources to specifically selected ZIM files', async () => {
    const searchEngine = new SearchEngine(mockSources as any);
    const mockProvider = new MockKiwixProvider();
    searchEngine.registerProvider(mockProvider);

    const response = await searchEngine.search('computer', {
      mode: 'local',
      zims: ['wikipedia_en_all'],
    });

    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].zimName, 'wikipedia_en_all');
    assert.ok(response.sources['Wikipedia (EN)']);
    assert.equal(response.sources['wikiHow (EN)'], undefined);
  });

  it('mixes results from multiple (1+) selected ZIM files', async () => {
    const searchEngine = new SearchEngine(mockSources as any);
    const mockProvider = new MockKiwixProvider();
    searchEngine.registerProvider(mockProvider);

    const response = await searchEngine.search('repair guide', {
      mode: 'local',
      zims: ['wikipedia_en_all', 'wikihow_en_all'],
    });

    assert.equal(response.results.length, 2);
    const zimNames = response.results.map((r) => r.zimName);
    assert.ok(zimNames.includes('wikipedia_en_all'));
    assert.ok(zimNames.includes('wikihow_en_all'));
    assert.equal(zimNames.includes('ifixit_en_all'), false);
  });

  it('filters sources based on category attachment (#)', async () => {
    const searchEngine = new SearchEngine(mockSources as any);
    const mockProvider = new MockKiwixProvider();
    searchEngine.registerProvider(mockProvider);

    const response = await searchEngine.search('fix laptop', {
      mode: 'local',
      categories: ['repair'],
    });

    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].zimName, 'ifixit_en_all');
  });
});
