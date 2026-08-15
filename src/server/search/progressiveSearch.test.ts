import { SearchEngine } from './SearchEngine.js';
import { SearchProvider } from './types.js';
import { SearchResult, SearchSourceConfig, StreamEventPayload } from '../../shared/types.js';

async function runProgressiveTests() {
  console.log('====================================================');
  console.log(' Running Progressive SSE Search & Controlled Concurrency Tests');
  console.log('====================================================\n');

  const mockSources: SearchSourceConfig[] = [
    {
      id: 'fast-zim',
      zimName: 'fast_zim_2026',
      name: 'Fast ZIM',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 9,
      category: 'guides',
      enabled: true,
      keywords: ['test'],
    },
    {
      id: 'slow-zim',
      zimName: 'slow_zim_2026',
      name: 'Slow ZIM',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 8,
      category: 'guides',
      enabled: true,
      keywords: ['test'],
    },
    {
      id: 'failing-zim',
      zimName: 'failing_zim_2026',
      name: 'Failing ZIM',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 7,
      category: 'guides',
      enabled: true,
      keywords: ['test'],
    },
  ];

  let currentActiveConcurrency = 0;
  let maxObservedConcurrency = 0;

  const mockProvider: SearchProvider = {
    name: 'kiwix',
    search: async () => [],
    searchZimSource: async (source: SearchSourceConfig) => {
      currentActiveConcurrency++;
      if (currentActiveConcurrency > maxObservedConcurrency) {
        maxObservedConcurrency = currentActiveConcurrency;
      }

      if (source.id === 'fast-zim') {
        await new Promise(r => setTimeout(r, 10));
        currentActiveConcurrency--;
        return [
          {
            id: 'fast-1',
            source: 'Fast ZIM',
            provider: 'kiwix',
            type: 'article',
            title: 'Fast Article 1',
            description: 'Fast snippet',
            url: 'http://si4k-server.local:8080/content/fast/1',
          },
        ];
      }

      if (source.id === 'slow-zim') {
        await new Promise(r => setTimeout(r, 350));
        currentActiveConcurrency--;
        return [
          {
            id: 'slow-1',
            source: 'Slow ZIM',
            provider: 'kiwix',
            type: 'article',
            title: 'Slow Article 1',
            description: 'Slow snippet',
            url: 'http://si4k-server.local:8080/content/slow/1',
          },
        ];
      }

      if (source.id === 'failing-zim') {
        await new Promise(r => setTimeout(r, 30));
        currentActiveConcurrency--;
        throw new Error('Simulated HTTP 400 network failure');
      }

      currentActiveConcurrency--;
      return [];
    },
  };

  const searchEngine = new SearchEngine(mockSources);
  searchEngine.registerProvider(mockProvider);

  // 1. Test Fast Results Appear Before Slow ZIM Finishes & One Failed ZIM Doesn't Crash Search
  console.log('1. Testing Progressive Streaming & Resiliency to Individual ZIM Failure...');
  const eventsReceived: StreamEventPayload[] = [];
  let fastEmittedBeforeSlow = false;

  await searchEngine.searchProgressive(
    'test',
    { mode: 'local', maxConcurrency: 2 },
    (payload) => {
      eventsReceived.push(payload);
      if (payload.event === 'results' && payload.data.results) {
        const titles = payload.data.results.map(r => r.title);
        if (titles.includes('Fast Article 1') && !titles.includes('Slow Article 1')) {
          fastEmittedBeforeSlow = true;
        }
      }
    }
  );

  console.log(`   Total SSE Stream Events Received: ${eventsReceived.length}`);
  const eventTypes = eventsReceived.map(e => e.event);
  console.log(`   Event Flow Sequence: ${eventTypes.join(' -> ')}`);

  if (!fastEmittedBeforeSlow) {
    console.error('❌ Fast results did NOT emit before slow ZIM finished!');
    process.exit(1);
  }
  console.log('   ✅ PASS: Fast ZIM results emitted progressively before slow ZIM finished.');

  const completeEvent = eventsReceived.find(e => e.event === 'complete');
  if (!completeEvent || !completeEvent.data.results) {
    console.error('❌ Complete event missing or invalid!');
    process.exit(1);
  }

  const finalTitles = completeEvent.data.results.map(r => r.title);
  if (!finalTitles.includes('Fast Article 1') || !finalTitles.includes('Slow Article 1')) {
    console.error(`❌ Final merged results incomplete! Got: ${finalTitles.join(', ')}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: Failing ZIM handled gracefully and remaining ZIM results merged successfully.\n');

  // 2. Test Concurrency Limit Enforcement
  console.log('2. Testing Concurrency Limit (MAX_CONCURRENT_ZIM_SEARCHES)...');
  const manySources: SearchSourceConfig[] = Array.from({ length: 15 }, (_, i) => ({
    id: `zim-${i}`,
    zimName: `zim_name_${i}`,
    name: `ZIM Source ${i}`,
    provider: 'kiwix',
    lang: 'en',
    basePriority: 5,
    category: 'general',
    enabled: true,
    keywords: ['concurrency'],
  }));

  currentActiveConcurrency = 0;
  maxObservedConcurrency = 0;

  const concurrencyProvider: SearchProvider = {
    name: 'kiwix',
    search: async () => [],
    searchZimSource: async () => {
      currentActiveConcurrency++;
      if (currentActiveConcurrency > maxObservedConcurrency) {
        maxObservedConcurrency = currentActiveConcurrency;
      }
      await new Promise(r => setTimeout(r, 20));
      currentActiveConcurrency--;
      return [];
    },
  };

  const concurrencyEngine = new SearchEngine(manySources);
  concurrencyEngine.registerProvider(concurrencyProvider);

  const configuredMaxConcurrency = 3;
  await concurrencyEngine.searchProgressive('concurrency test', { maxConcurrency: configuredMaxConcurrency }, () => {});

  console.log(`   Configured Max Concurrency: ${configuredMaxConcurrency}`);
  console.log(`   Max Observed Parallel Workers: ${maxObservedConcurrency}`);

  if (maxObservedConcurrency > configuredMaxConcurrency) {
    console.error(`❌ Concurrency limit exceeded! Observed ${maxObservedConcurrency} > ${configuredMaxConcurrency}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: Controlled concurrency limit strictly respected!\n');

  console.log('====================================================');
  console.log(' ✅ ALL PROGRESSIVE SSE & CONCURRENCY TESTS PASSED!');
  console.log('====================================================');
}

runProgressiveTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
