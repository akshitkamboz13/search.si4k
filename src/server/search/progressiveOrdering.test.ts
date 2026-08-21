import { SearchEngine } from './SearchEngine.js';
import { SearchProvider } from './types.js';
import { SearchSourceConfig, StreamEventPayload } from '../../shared/types.js';

async function runProgressiveOrderingTest() {
  console.log('====================================================');
  console.log(' Running Progressive Result Ordering & Priority Re-Ranking Test');
  console.log('====================================================\n');

  // Test setup with deliberate reversed completion order (iFixit finishes first, Wikipedia finishes last)
  const mockSources: SearchSourceConfig[] = [
    {
      id: 'wikipedia',
      zimName: 'wikipedia_en_2026',
      name: 'Wikipedia',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 30,
      category: 'general',
      enabled: true,
      keywords: ['test'],
    },
    {
      id: 'arch-wiki',
      zimName: 'archwiki_en_2026',
      name: 'Arch Wiki',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 25,
      category: 'linux',
      enabled: true,
      keywords: ['test'],
    },
    {
      id: 'ifixit',
      zimName: 'ifixit_en_2026',
      name: 'iFixit',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 5,
      category: 'repair',
      enabled: true,
      keywords: ['test'],
    },
  ];

  const delayMap: Record<string, number> = {
    'wikipedia': 500, // Priority 30 (slowest completion)
    'arch-wiki': 250, // Priority 25 (medium completion)
    'ifixit': 50,     // Priority 5  (fastest completion)
  };

  const mockProvider: SearchProvider = {
    name: 'kiwix',
    search: async () => [],
    searchZimSource: async (source: SearchSourceConfig) => {
      const delay = delayMap[source.id] || 50;
      await new Promise(r => setTimeout(r, delay));

      return [
        {
          id: `${source.id}-result-1`,
          source: source.name,
          provider: 'kiwix',
          type: 'article',
          title: `${source.name} Article 1`,
          description: `Description from ${source.name}`,
          url: `http://si4k-server.local:8080/content/${source.zimName}/article-1`,
          sourceId: source.id,
          effectivePriority: source.basePriority,
        },
      ];
    },
  };

  const searchEngine = new SearchEngine(mockSources);
  searchEngine.registerProvider(mockProvider);

  console.log('Starting progressive search with artificial completion delays:');
  console.log(' - iFixit    (Priority 5)  -> Delay: 50ms');
  console.log(' - Arch Wiki (Priority 25) -> Delay: 250ms');
  console.log(' - Wikipedia (Priority 30) -> Delay: 500ms\n');

  const receivedBatches: string[][] = [];

  await searchEngine.searchProgressive(
    'test ordering',
    { mode: 'local', maxConcurrency: 3, minSourcesBeforeStreamMix: 1 },
    (payload: StreamEventPayload) => {
      if (payload.event === 'results' && payload.data.results) {
        const order = payload.data.results.map(r => r.source);
        if (order.length > 0) {
          receivedBatches.push(order);
          console.log(`[SSE Results Event] Current Display Order (${order.length} items): ${order.join(' > ')}`);
        }
      }
    }
  );

  console.log('\nAnalyzing progressive re-ranking timeline across emitted batches:');

  // Verify Batch 1 (Only iFixit has finished)
  const batch1 = receivedBatches.find(b => b.includes('iFixit') && !b.includes('Arch Wiki') && !b.includes('Wikipedia'));
  if (!batch1) {
    console.error('❌ Batch 1 verification failed: Expected iFixit to appear first!');
    process.exit(1);
  }
  console.log('   ✅ PASS 1 (50ms): iFixit rendered first.');

  // Verify Batch 2 (Arch Wiki finishes, moves ABOVE iFixit)
  const batch2 = receivedBatches.find(b => b.includes('Arch Wiki') && !b.includes('Wikipedia'));
  if (!batch2 || batch2[0] !== 'Arch Wiki') {
    console.error('❌ Batch 2 verification failed: Expected Arch Wiki to re-rank above iFixit!');
    process.exit(1);
  }
  console.log('   ✅ PASS 2 (250ms): Arch Wiki (Priority 25) re-ranked above iFixit (Priority 5).');

  // Verify Batch 3 (Wikipedia finishes, moves to top position ABOVE Arch Wiki)
  const finalBatch = receivedBatches[receivedBatches.length - 1];
  console.log(`   Final Batch Display Order: ${finalBatch.join(' > ')}`);

  if (finalBatch[0] !== 'Wikipedia' || finalBatch[1] !== 'Arch Wiki' || finalBatch[2] !== 'iFixit') {
    console.error(`❌ Final Batch verification failed! Expected Wikipedia > Arch Wiki > iFixit, got: ${finalBatch.join(' > ')}`);
    process.exit(1);
  }
  console.log('   ✅ PASS 3 (500ms): Wikipedia (Priority 30) re-ranked above Arch Wiki and iFixit.');

  console.log('\n====================================================');
  console.log(' ✅ ALL PROGRESSIVE ORDERING & RE-RANKING TESTS PASSED!');
  console.log('====================================================');
}

runProgressiveOrderingTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
