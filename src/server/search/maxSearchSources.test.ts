import { SearchEngine } from './SearchEngine.js';
import { ZimLibrary, DiscoveredZim } from './ZimLibrary.js';
import { SearchProvider } from './types.js';
import { SearchResult, SearchSourceConfig } from '../../shared/types.js';
import { config, parseMaxSearchSources } from '../config.js';

async function runMaxSearchSourcesTests() {
  console.log('====================================================');
  console.log(' Running Configurable Max Search Sources Tests');
  console.log('====================================================\n');

  // 1. Testing Config Parsing & Environment Variable Validation
  console.log('1. Testing Config Parsing & Environment Variable Validation...');
  if (parseMaxSearchSources(undefined) !== undefined) {
    console.error('❌ Unset variable parsing failed! Expected undefined.');
    process.exit(1);
  }
  if (parseMaxSearchSources('') !== undefined) {
    console.error('❌ Empty string parsing failed! Expected undefined.');
    process.exit(1);
  }
  if (parseMaxSearchSources('5') !== 5) {
    console.error(`❌ Valid '5' parsing failed! Expected 5, got ${parseMaxSearchSources('5')}.`);
    process.exit(1);
  }
  if (parseMaxSearchSources('32') !== 32) {
    console.error(`❌ Valid '32' parsing failed! Expected 32, got ${parseMaxSearchSources('32')}.`);
    process.exit(1);
  }
  if (parseMaxSearchSources('0') !== undefined) {
    console.error('❌ Invalid "0" parsing failed! Expected undefined fallback.');
    process.exit(1);
  }
  if (parseMaxSearchSources('-10') !== undefined) {
    console.error('❌ Invalid negative "-10" parsing failed! Expected undefined fallback.');
    process.exit(1);
  }
  if (parseMaxSearchSources('invalid_string') !== undefined) {
    console.error('❌ Invalid "invalid_string" parsing failed! Expected undefined fallback.');
    process.exit(1);
  }
  if (parseMaxSearchSources('NaN') !== undefined) {
    console.error('❌ Invalid "NaN" parsing failed! Expected undefined fallback.');
    process.exit(1);
  }
  console.log('   ✅ PASS: Environment variable parsing & invalid value handling validated.\n');

  // Create mock ZIM sources: 10 Linux ZIMs, 10 Programming ZIMs, 60 General ZIMs = 80 total
  const linuxSources: DiscoveredZim[] = Array.from({ length: 10 }, (_, i) => ({
    id: `zim-linux-${i}`,
    zimName: `archlinux_test_${i}`,
    name: `Linux Wiki ${i}`,
    title: `Linux Wiki ${i}`,
    provider: 'kiwix',
    lang: 'en',
    basePriority: 10 - i,
    category: 'linux',
    categories: ['linux'],
    enabled: true,
    keywords: ['linux', 'terminal', 'bash', 'kernel'],
    tags: ['linux'],
    description: `Linux documentation ${i}`,
  }));

  const programmingSources: DiscoveredZim[] = Array.from({ length: 10 }, (_, i) => ({
    id: `zim-prog-${i}`,
    zimName: `devdocs_test_${i}`,
    name: `DevDocs ${i}`,
    title: `DevDocs ${i}`,
    provider: 'kiwix',
    lang: 'en',
    basePriority: 10 - i,
    category: 'programming',
    categories: ['programming'],
    enabled: true,
    keywords: ['programming', 'react', 'javascript', 'code'],
    tags: ['programming'],
    description: `Programming documentation ${i}`,
  }));

  const generalSources: DiscoveredZim[] = Array.from({ length: 60 }, (_, i) => ({
    id: `zim-gen-${i}`,
    zimName: `general_${i}`,
    name: `General Source ${i}`,
    title: `General Source ${i}`,
    provider: 'kiwix',
    lang: 'en',
    basePriority: 60 - i,
    category: 'general',
    categories: ['general'],
    enabled: true,
    keywords: ['general'],
    tags: ['general'],
    description: `General documentation ${i}`,
  }));

  const mockSources = [...linuxSources, ...programmingSources, ...generalSources];

  const mockLibrary = {
    getDiscoveredSources: async () => mockSources,
    shutdown: () => {},
  } as unknown as ZimLibrary;

  let searchedSources: SearchSourceConfig[] = [];
  let currentWorkers = 0;
  let maxWorkersObserved = 0;

  const mockProvider: SearchProvider & { searchZimSource: Function; setSources: Function } = {
    name: 'kiwix',
    setSources: () => {},
    searchZimSource: async (source: SearchSourceConfig, query: string): Promise<SearchResult[]> => {
      searchedSources.push(source);
      currentWorkers++;
      maxWorkersObserved = Math.max(maxWorkersObserved, currentWorkers);
      await new Promise(resolve => setTimeout(resolve, 5));
      currentWorkers--;
      return [
        {
          id: `${source.zimName}:1`,
          source: source.name,
          provider: 'kiwix',
          zimName: source.zimName,
          sourceId: source.id,
          type: 'article',
          title: `Result from ${source.name}`,
          description: `Query: ${query}`,
          url: `http://localhost/${source.zimName}`,
        },
      ];
    },
    search: async (): Promise<SearchResult[]> => [],
  };

  const searchEngine = new SearchEngine(mockLibrary);
  searchEngine.registerProvider(mockProvider);

  // 2. Testing KIWIX_MAX_SEARCH_SOURCES=5 limits dispatch to at most 5 sources
  console.log('2. Testing KIWIX_MAX_SEARCH_SOURCES=5 limits dispatch to at most 5 sources...');
  searchedSources = [];
  searchEngine.searchCache.clear();

  await searchEngine.search('test', { maxSearchSources: 5 });

  console.log(`   Searched Sources Count: ${searchedSources.length}`);
  if (searchedSources.length !== 5) {
    console.error(`❌ Expected exactly 5 sources searched, got ${searchedSources.length}.`);
    process.exit(1);
  }
  console.log('   ✅ PASS: KIWIX_MAX_SEARCH_SOURCES=5 limited dispatch to exactly 5 sources.\n');

  // 3. Testing selected top 5 sources depend dynamically on the query intent
  console.log('3. Testing Selected Top 5 Sources Depend Dynamically on Query Intent...');

  // Query A: "linux terminal" should select top Linux sources
  searchedSources = [];
  searchEngine.searchCache.clear();
  await searchEngine.search('linux terminal', { maxSearchSources: 5 });

  const queryALinuxCount = searchedSources.filter(s => s.category === 'linux').length;
  console.log(`   Query "linux terminal" selected ${queryALinuxCount}/5 Linux category sources.`);
  if (queryALinuxCount === 0) {
    console.error('❌ Query "linux terminal" failed to select Linux category sources in top 5!');
    process.exit(1);
  }

  // Query B: "react javascript" should select top Programming sources
  searchedSources = [];
  searchEngine.searchCache.clear();
  await searchEngine.search('react javascript', { maxSearchSources: 5 });

  const queryBProgCount = searchedSources.filter(s => s.category === 'programming').length;
  console.log(`   Query "react javascript" selected ${queryBProgCount}/5 Programming category sources.`);
  if (queryBProgCount === 0) {
    console.error('❌ Query "react javascript" failed to select Programming category sources in top 5!');
    process.exit(1);
  }
  console.log('   ✅ PASS: Dynamic source selection selected query-relevant sources for both queries.\n');

  // 4. Testing limit larger than available sources does not truncate results (e.g. limit=100 with 20 total relevant sources)
  console.log('4. Testing Limit Larger Than Available Sources Does Not Truncate Results...');
  const smallMockLibrary = {
    getDiscoveredSources: async () => mockSources.slice(0, 15),
    shutdown: () => {},
  } as unknown as ZimLibrary;

  const smallEngine = new SearchEngine(smallMockLibrary);
  smallEngine.registerProvider(mockProvider);
  searchedSources = [];

  await smallEngine.search('test', { maxSearchSources: 100 });

  console.log(`   Available: 15 | Limit: 100 | Searched Sources Count: ${searchedSources.length}`);
  if (searchedSources.length !== 15) {
    console.error(`❌ Expected all 15 available sources searched when limit=100 > available=15, got ${searchedSources.length}.`);
    process.exit(1);
  }
  console.log('   ✅ PASS: Searched all 15 available sources without truncation when N > available.\n');

  // 5. Unset/default behavior remains backward compatible (searches all available sources)
  console.log('5. Testing Unset/Default Behavior Remains Backward Compatible...');
  searchedSources = [];
  const origMaxSources = config.kiwix.maxSearchSources;
  config.kiwix.maxSearchSources = undefined;
  await searchEngine.search('test', { maxSearchSources: undefined });
  config.kiwix.maxSearchSources = origMaxSources;

  console.log(`   Searched Sources Count: ${searchedSources.length}`);
  if (searchedSources.length !== 80) {
    console.error(`❌ Unset limit failed! Expected 80 sources searched, got ${searchedSources.length}.`);
    process.exit(1);
  }
  console.log('   ✅ PASS: Unset/default behavior searched all 80 available sources.\n');

  // 6. Verifying concurrency remains bounded
  console.log('6. Verifying Concurrency Remains Bounded with Source Limit...');
  searchedSources = [];
  maxWorkersObserved = 0;
  searchEngine.searchCache.clear();
  await searchEngine.search('test', { maxSearchSources: 5, maxConcurrency: 2 });

  console.log(`   Max Workers Observed: ${maxWorkersObserved}`);
  if (maxWorkersObserved > 2) {
    console.error(`❌ Concurrency bound exceeded! Max observed ${maxWorkersObserved} (expected <= 2).`);
    process.exit(1);
  }
  console.log('   ✅ PASS: Bounded worker concurrency strictly enforced.\n');

  // 7. Verifying ZIM reconciliation discovery is unaffected
  console.log('7. Verifying ZIM Reconciliation Discovery Unaffected...');
  const discovered = await searchEngine.getDiscoveredSources();
  if (discovered.length !== 80) {
    console.error(`❌ Discovered sources count altered! Expected 80, got ${discovered.length}.`);
    process.exit(1);
  }
  console.log('   ✅ PASS: All 80 ZIM sources retained in index.\n');

  console.log('====================================================');
  console.log(' ✅ ALL CONFIGURABLE MAX SEARCH SOURCES TESTS PASSED!');
  console.log('====================================================');
}

runMaxSearchSourcesTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
