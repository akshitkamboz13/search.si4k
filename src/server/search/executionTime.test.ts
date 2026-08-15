import { SearchEngine } from './SearchEngine.js';
import { SearchProvider } from './types.js';
import { SearchResult, SearchOptions } from '../../shared/types.js';

class DelayedMockProvider implements SearchProvider {
  readonly name = 'delayed-mock';
  private delayMs: number;

  constructor(delayMs: number = 50) {
    this.delayMs = delayMs;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    await new Promise(res => setTimeout(res, this.delayMs));
    return [
      {
        id: 'mock-1',
        source: 'Delayed Source',
        provider: 'delayed-mock',
        type: 'article',
        title: `Delayed Result for ${query}`,
        description: 'Test description',
        url: 'http://localhost/test',
      },
    ];
  }
}

async function runExecutionTimeTests() {
  console.log('====================================================');
  console.log(' Running Search Execution Time Verification Tests');
  console.log('====================================================\n');

  console.log('1. Testing Non-Streaming Search Execution Duration...');
  const searchEngine = new SearchEngine();
  const mockProvider = new DelayedMockProvider(50);
  searchEngine.registerProvider(mockProvider);

  const mockSources = [
    {
      id: 'mock-source-1',
      zimName: 'mock_zim_1',
      name: 'Delayed Source',
      provider: 'delayed-mock',
      basePriority: 5,
      enabled: true,
      category: 'general',
    },
  ];

  (searchEngine as any).zimLibrary = {
    getDiscoveredSources: async () => mockSources,
  };

  const response = await searchEngine.search('nonstreaming test query', { mode: 'local' });
  console.log(`   Non-Streaming Search Execution Time: ${response.meta.executionTimeMs}ms`);

  if (!response.meta.executionTimeMs || response.meta.executionTimeMs < 30) {
    console.error(`❌ Test 1 Failed! Expected executionTimeMs >= 30ms, got ${response.meta.executionTimeMs}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: Non-streaming search measured real execution duration (> 30ms).\n');

  console.log('2. Testing Streaming Progressive Search Execution Duration & Timer Non-Reset...');
  const events: any[] = [];
  await searchEngine.searchProgressive('streaming test query', { mode: 'local' }, (payload) => {
    events.push(payload);
  });

  const resultEvents = events.filter(e => e.event === 'results');
  const completeEvents = events.filter(e => e.event === 'complete');

  if (resultEvents.length === 0 || completeEvents.length === 0) {
    console.error('❌ Test 2 Failed! Missing SSE results or complete events');
    process.exit(1);
  }

  const finalCompleteEvent = completeEvents[completeEvents.length - 1];
  const finalTimeMs = finalCompleteEvent.data.meta.executionTimeMs;

  console.log(`   Intermediate Results Count: ${resultEvents.length}`);
  console.log(`   Final SSE Complete Execution Time: ${finalTimeMs}ms`);

  if (!finalTimeMs || finalTimeMs < 30) {
    console.error(`❌ Test 2 Failed! Final SSE complete event executionTimeMs was ${finalTimeMs}, expected >= 30ms`);
    process.exit(1);
  }

  // Verify that timer is monotonic and never resets to 0
  let prevTime = 0;
  for (const evt of resultEvents) {
    const time = evt.data.meta.executionTimeMs;
    console.log(`   Progressive SSE Batch Execution Time: ${time}ms`);
    if (time === 0 || time < prevTime) {
      console.error(`❌ Test 2 Failed! SSE batch timer reset or dropped (prev=${prevTime}, current=${time})`);
      process.exit(1);
    }
    prevTime = time;
  }

  console.log('   ✅ PASS: Progressive streaming timer measured real duration and maintained non-resetting monotonicity.\n');

  console.log('====================================================');
  console.log(' ✅ ALL EXECUTION TIME VERIFICATION TESTS PASSED!');
  console.log('====================================================');
}

runExecutionTimeTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
