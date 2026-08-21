import { SearchEngine } from './SearchEngine.js';
import { ZimLibrary, DiscoveredZim } from './ZimLibrary.js';
import { SearchProvider } from './types.js';
import { SearchResult, SearchOptions, SearchSourceConfig } from '../../shared/types.js';

async function runRegressionTests() {
  console.log('====================================================');
  console.log(' Running Search Amplification Regression Tests');
  console.log('====================================================\n');

  // Create 134 mock ZIM sources (simulating full production catalog after reconciliation)
  const mockSources: DiscoveredZim[] = Array.from({ length: 134 }, (_, i) => ({
    id: `zim-${i}-test_zim_${i}`,
    zimName: `test_zim_${i}`,
    name: `Test ZIM Source ${i}`,
    title: `Test ZIM Source ${i}`,
    provider: 'kiwix',
    lang: 'en',
    basePriority: 5,
    category: i % 2 === 0 ? 'linux' : 'programming',
    categories: [i % 2 === 0 ? 'linux' : 'programming'],
    enabled: true,
    keywords: ['linux', 'test'],
    tags: ['linux', 'test'],
    description: `Test description for ZIM source ${i}`,
  }));

  const mockLibrary = {
    getDiscoveredSources: async () => mockSources,
    shutdown: () => {},
  } as unknown as ZimLibrary;

  let totalSearchZimCalls = 0;
  let currentActiveWorkers = 0;
  let maxObservedWorkers = 0;

  const mockKiwixProvider: SearchProvider & { searchZimSource: Function; setSources: Function } = {
    name: 'kiwix',
    setSources: (_sources: SearchSourceConfig[]) => {},
    searchZimSource: async (source: SearchSourceConfig, query: string): Promise<SearchResult[]> => {
      totalSearchZimCalls++;
      currentActiveWorkers++;
      maxObservedWorkers = Math.max(maxObservedWorkers, currentActiveWorkers);

      // Simulate small async network delay
      await new Promise(resolve => setTimeout(resolve, 5));

      currentActiveWorkers--;

      return [
        {
          id: `${source.zimName}:article-1`,
          source: source.name,
          provider: 'kiwix',
          zimName: source.zimName,
          sourceId: source.id,
          type: 'article',
          title: `Linux article from ${source.name}`,
          description: `Description for ${query}`,
          url: `http://localhost/content/${source.zimName}/article-1`,
        },
      ];
    },
    search: async (query: string, options: SearchOptions = {}): Promise<SearchResult[]> => {
      // Return empty default to catch invalid nested loop calls
      return [];
    },
  };

  const searchEngine = new SearchEngine(mockLibrary);
  searchEngine.registerProvider(mockKiwixProvider);

  console.log('1. Testing non-streaming search() query execution with 134 sources...');
  const start = Date.now();
  const response = await searchEngine.search('linux', { mode: 'local', lang: 'en', maxSearchSources: 134 });
  const duration = Date.now() - start;

  console.log(`   Execution Time: ${duration}ms`);
  console.log(`   Total Results Returned: ${response.results.length}`);
  console.log(`   Total searchZimSource calls: ${totalSearchZimCalls}`);
  console.log(`   Max Observed Concurrency: ${maxObservedWorkers}`);

  if (totalSearchZimCalls !== 134) {
    console.error(`❌ Search amplification regression detected! Expected 134 searchZimSource calls, got ${totalSearchZimCalls}.`);
    process.exit(1);
  }
  console.log('   ✅ PASS: Exactly 1 searchZimSource call per source (no O(N^2) request multiplication).\n');

  if (maxObservedWorkers > 8) {
    console.error(`❌ Concurrency limit exceeded! Observed max ${maxObservedWorkers} parallel workers (expected <= 8).`);
    process.exit(1);
  }
  console.log('   ✅ PASS: Controlled concurrency respected.\n');

  if (response.results.length === 0) {
    console.error('❌ Search returned 0 results for query "linux"!');
    process.exit(1);
  }
  console.log('   ✅ PASS: Non-empty search results mixed and returned successfully.\n');

  console.log('====================================================');
  console.log(' ✅ ALL SEARCH AMPLIFICATION REGRESSION TESTS PASSED!');
  console.log('====================================================');
}

runRegressionTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
