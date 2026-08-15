import { SearchEngine } from './SearchEngine.js';
import { KiwixProvider } from './providers/KiwixProvider.js';
import { config } from '../config.js';

async function runKiwixTruncationTests() {
  console.log('====================================================');
  console.log(' Running Two-Wave Priority Search & Extreme Limits');
  console.log('====================================================\n');

  const searchEngine = new SearchEngine();
  const kiwixProvider = new KiwixProvider({
    localUrl: config.kiwix.localUrl,
    localPublicUrl: config.kiwix.localPublicUrl,
    onlineUrl: config.kiwix.onlineUrl,
    onlinePublicUrl: config.kiwix.onlinePublicUrl,
    maxCandidatesPerSource: config.kiwix.candidateLimit,
  });

  searchEngine.registerProvider(kiwixProvider);

  console.log('1. Testing Kiwix HTML Total Reported Match Parsing...');
  const sampleHtml = `<div class="header">Results <b>1-25</b> of <b>94791</b> for <b>"Delhi"</b></div>`;
  const reportedTotal = kiwixProvider.parseKiwixReportedTotal(sampleHtml);
  console.log(`   Reported total parsed: ${reportedTotal}`);
  if (reportedTotal !== 94791) {
    console.error(`❌ Test 1 Failed! Expected reported total 94791, got ${reportedTotal}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: Kiwix reported total matched 94791.\n');

  console.log('2. Tracing Candidate Boundary Enforcement for "Wikipedia"...');
  const wikiSource = {
    id: 'wikipedia',
    zimName: 'wikipedia_en_all_nopic_2026-06',
    name: 'Wikipedia',
    provider: 'kiwix',
    basePriority: 6,
    enabled: true,
    lang: 'en',
    category: 'general',
    keywords: ['wikipedia'],
  };

  const results10 = await kiwixProvider.searchZimSource(wikiSource, 'Delhi', 'local');
  console.log(`   Wikipedia Candidate Pool Size: ${results10.length} (Limit: ${config.kiwix.candidateLimit})`);

  if (results10.length > config.kiwix.candidateLimit) {
    console.error(`❌ Test 2 Failed! Wikipedia returned ${results10.length} candidates, exceeded limit ${config.kiwix.candidateLimit}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: Kiwix boundary candidate limit strictly respected.\n');

  console.log('3. Testing SearchCache LRU Eviction & Complete Session Caching...');
  searchEngine.searchCache.clear();
  config.cache.enabled = true;
  config.cache.maxEntries = 2;
  config.cache.debug = true;

  searchEngine.searchCache.set('query1:local:en:v1', { unifiedResults: [], sourceCounts: {} });
  searchEngine.searchCache.set('query2:local:en:v1', { unifiedResults: [], sourceCounts: {} });
  console.log(`   Cache Size after 2 entries: ${searchEngine.searchCache.size}`);

  searchEngine.searchCache.set('query3:local:en:v1', { unifiedResults: [], sourceCounts: {} });
  console.log(`   Cache Size after 3rd entry (max 2): ${searchEngine.searchCache.size}`);

  if (searchEngine.searchCache.get('query1:local:en:v1') !== null) {
    console.error('❌ Test 3 Failed! query1 was expected to be evicted by LRU policy');
    process.exit(1);
  }
  console.log('   ✅ PASS: SearchCache LRU eviction policy functioning correctly.\n');

  console.log('====================================================');
  console.log(' ✅ ALL KIWIX BOUNDARY & CACHE CONTROL TESTS PASSED!');
  console.log('====================================================');
}

runKiwixTruncationTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
