import { SearchEngine } from './SearchEngine.js';
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
  console.log(' Running SearchEngine Priority Ranking, Mixing & Pagination Tests');
  console.log('====================================================\n');

  const ranker = new SourceRanker(mockScoring);

  // Test Case 1: "create folder in arch" -> Arch Wiki outranks wikiHow and Wikipedia
  console.log('1. Testing Query: "create folder in arch"...');
  const q1Ranked = ranker.rankSources(testSources, 'create folder in arch');
  console.log(`   Top Source: ${q1Ranked[0].name} (effectivePriority: ${q1Ranked[0].effectivePriority})`);

  if (q1Ranked[0].name !== 'Arch Wiki') {
    console.error(`❌ Test 1 Failed! Expected Arch Wiki to be top ranked, got ${q1Ranked[0].name}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: "create folder in arch" correctly prioritized Arch Wiki as top source.\n');

  // Test Case 2: "how to repair a wall" -> wikiHow / iFixit high priority
  console.log('2. Testing Query: "how to repair a wall"...');
  const q2Ranked = ranker.rankSources(testSources, 'how to repair a wall');
  const topTwoNames = [q2Ranked[0].name, q2Ranked[1].name];

  if (!topTwoNames.includes('wikiHow') || !topTwoNames.includes('iFixit')) {
    console.error(`❌ Test 2 Failed! Expected wikiHow/iFixit in top two, got ${topTwoNames.join(', ')}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: "how to repair a wall" correctly prioritized wikiHow and iFixit.\n');

  // Test Case 3: "capital of france" -> Wikipedia high priority
  console.log('3. Testing Query: "capital of france"...');
  const q3Ranked = ranker.rankSources(testSources, 'capital of france');
  if (q3Ranked[0].name !== 'Wikipedia') {
    console.error(`❌ Test 3 Failed! Expected Wikipedia to be top ranked, got ${q3Ranked[0].name}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: "capital of france" correctly prioritized Wikipedia.\n');

  // Test Case 4: Pagination with 45 Candidates -> 3 Total Pages
  console.log('4. Testing Unified Pagination (45 Candidates -> 3 Pages)...');
  const searchEngine = new SearchEngine(testSources, mockScoring);

  const mock45Results: SearchResult[] = Array.from({ length: 45 }, (_, i) => ({
    id: `item-${i + 1}`,
    source: 'wikiHow',
    provider: 'kiwix',
    type: 'article',
    title: `Article ${i + 1}`,
    description: `Snippet ${i + 1}`,
    url: `https://wiki.si4k.online/content/wikihow/Article_${i + 1}`,
  }));

  // Page 1: items 1-20
  const p1 = searchEngine.paginateResults(mock45Results, 1, 20);
  console.log(`   Page 1: ${p1.results.length} items (Page ${p1.page} of ${p1.totalPages}) | hasNext: ${p1.hasNextPage}, hasPrev: ${p1.hasPreviousPage}`);
  if (p1.results.length !== 20 || p1.results[0].title !== 'Article 1' || p1.results[19].title !== 'Article 20' || p1.totalPages !== 3 || !p1.hasNextPage || p1.hasPreviousPage) {
    console.error('❌ Page 1 pagination failed!');
    process.exit(1);
  }

  // Page 2: items 21-40
  const p2 = searchEngine.paginateResults(mock45Results, 2, 20);
  console.log(`   Page 2: ${p2.results.length} items (Page ${p2.page} of ${p2.totalPages}) | hasNext: ${p2.hasNextPage}, hasPrev: ${p2.hasPreviousPage}`);
  if (p2.results.length !== 20 || p2.results[0].title !== 'Article 21' || p2.results[19].title !== 'Article 40' || !p2.hasNextPage || !p2.hasPreviousPage) {
    console.error('❌ Page 2 pagination failed!');
    process.exit(1);
  }

  // Page 3: items 41-45
  const p3 = searchEngine.paginateResults(mock45Results, 3, 20);
  console.log(`   Page 3: ${p3.results.length} items (Page ${p3.page} of ${p3.totalPages}) | hasNext: ${p3.hasNextPage}, hasPrev: ${p3.hasPreviousPage}`);
  if (p3.results.length !== 5 || p3.results[0].title !== 'Article 41' || p3.results[4].title !== 'Article 45' || p3.hasNextPage || !p3.hasPreviousPage) {
    console.error('❌ Page 3 pagination failed!');
    process.exit(1);
  }
  console.log('   ✅ PASS: 45 candidate results correctly paginated across 3 pages.\n');

  // Test Case 5: Edge Case Page Parameters Handling
  console.log('5. Testing Edge Case Page Parameters Handling...');
  const edgePage0 = searchEngine.paginateResults(mock45Results, 0, 20);
  const edgePageNeg = searchEngine.paginateResults(mock45Results, -1, 20);
  const edgePageNaN = searchEngine.paginateResults(mock45Results, NaN, 20);
  const edgePageBeyond = searchEngine.paginateResults(mock45Results, 999, 20);

  if (edgePage0.page !== 1 || edgePageNeg.page !== 1 || edgePageNaN.page !== 1) {
    console.error('❌ Edge case invalid page normalization failed!');
    process.exit(1);
  }
  if (edgePageBeyond.page !== 3 || edgePageBeyond.results.length !== 5) {
    console.error('❌ Edge case page beyond totalPages clamping failed!');
    process.exit(1);
  }
  console.log('   ✅ PASS: Edge case page parameters (0, -1, NaN, 999) handled safely.\n');

  console.log('====================================================');
  console.log(' ✅ ALL PAGINATION & ENGINE TESTS PASSED!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
