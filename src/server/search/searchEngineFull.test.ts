import { SearchEngine } from './SearchEngine.js';
import { KiwixProvider } from './providers/KiwixProvider.js';
import { SourceRanker } from './sourceRanker.js';
import { ResultMixer } from './resultMixer.js';
import { SearchResult, SearchSourceConfig, ScoringConfig } from '../../shared/types.js';

const mockScoring: ScoringConfig = {
  exactDomainMatchScore: 7,
  exactPhraseKeywordScore: 4,
  singleKeywordScore: 2,
  categoryMatchScore: 3,
};

const testSources: SearchSourceConfig[] = [
  {
    id: 'archwiki_en_2026_07',
    zimName: 'archlinux_en_all_maxi_2026-07',
    name: 'Arch Wiki',
    provider: 'kiwix',
    lang: 'en',
    basePriority: 6,
    category: 'technical',
    enabled: true,
    keywords: ['arch', 'arch linux', 'pacman', 'aur', 'systemd', 'linux', 'terminal', 'bash', 'folder', 'directory'],
  },
  {
    id: 'wikihow_en_2023_03',
    zimName: 'wikihow_en_maxi_2023-03',
    name: 'wikiHow',
    provider: 'kiwix',
    lang: 'en',
    basePriority: 9,
    category: 'guides',
    enabled: true,
    keywords: ['how to', 'how', 'repair', 'fix', 'diy', 'make', 'create', 'build', 'step by step'],
  },
  {
    id: 'ifixit_en_2025_12',
    zimName: 'ifixit_en_all_2025-12',
    name: 'iFixit',
    provider: 'kiwix',
    lang: 'en',
    basePriority: 9,
    category: 'repair',
    enabled: true,
    keywords: ['repair', 'replace', 'battery', 'screen', 'teardown', 'hardware', 'tool', 'part', 'wall', 'fix'],
  },
  {
    id: 'wikipedia_en_2026_06',
    zimName: 'wikipedia_en_all_nopic_2026-06',
    name: 'Wikipedia',
    provider: 'kiwix',
    lang: 'en',
    basePriority: 6,
    category: 'general',
    enabled: true,
    keywords: ['general knowledge', 'history', 'geography', 'science', 'biography', 'overview', 'capital', 'france', 'city'],
  },
];

async function runTests() {
  console.log('====================================================');
  console.log(' Running SearchEngine Mode & Integration Tests');
  console.log('====================================================\n');

  const ranker = new SourceRanker(mockScoring);

  // 1. Query-dependent source ranking
  console.log('1. Testing Query: "create folder in arch"...');
  const q1Ranked = ranker.rankSources(testSources, 'create folder in arch');
  if (q1Ranked[0].name !== 'Arch Wiki') {
    console.error(`❌ Test 1 Failed! Expected Arch Wiki to be top ranked, got ${q1Ranked[0].name}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: "create folder in arch" correctly prioritized Arch Wiki.\n');

  // 2. SearchEngine Mode Verification
  console.log('2. Testing SearchEngine Server-Side Mode Response...');
  const provider = new KiwixProvider({
    localUrl: 'http://192.168.31.250:8080',
    localPublicUrl: 'http://si4k-server.local:8080',
    onlineUrl: 'http://192.168.31.250:8080',
    onlinePublicUrl: 'https://wiki.si4k.online',
    sources: testSources,
  });

  const searchEngine = new SearchEngine(testSources, mockScoring);
  searchEngine.registerProvider(provider);

  const localResp = await searchEngine.search('test query', { mode: 'local' });
  const onlineResp = await searchEngine.search('test query', { mode: 'online' });

  if (localResp.meta.mode !== 'local' || onlineResp.meta.mode !== 'online') {
    console.error('❌ SearchEngine response meta.mode test failed!');
    process.exit(1);
  }
  console.log('   ✅ PASS: Response meta.mode accurately reflects requested mode (local vs online).\n');

  // 3. Unified Pagination
  console.log('3. Testing Unified Pagination...');
  const mock45Results: SearchResult[] = Array.from({ length: 45 }, (_, i) => ({
    id: `item-${i + 1}`,
    source: 'wikiHow',
    provider: 'kiwix',
    type: 'article',
    title: `Article ${i + 1}`,
    description: `Snippet ${i + 1}`,
    url: `http://si4k-server.local:8080/content/wikihow/Article_${i + 1}`,
  }));

  const p1 = searchEngine.paginateResults(mock45Results, 1, 20);
  if (p1.results.length !== 20 || p1.totalPages !== 3 || !p1.hasNextPage || p1.hasPreviousPage) {
    console.error('❌ Pagination test failed!');
    process.exit(1);
  }
  console.log('   ✅ PASS: Unified pagination verified.\n');

  console.log('====================================================');
  console.log(' ✅ ALL ENGINE & MODE INTEGRATION TESTS PASSED!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
