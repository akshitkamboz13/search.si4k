import { SearchResponse, StreamEventPayload, SearchResult } from '../shared/types.js';

async function runFrontendOrderingTests() {
  console.log('====================================================');
  console.log(' Running Frontend Progressive Immutable Append & Page Lock Tests');
  console.log('====================================================\n');

  // Simulation of App.tsx immutable state manager
  let currentResponseState: SearchResponse | null = null;
  const accumulatedResults: SearchResult[] = [];
  const seenResultIds = new Set<string>();

  const updateResponseState = (currentPage: number) => {
    const pageSize = 20;
    const totalResults = accumulatedResults.length;
    const totalPages = totalResults > 0 ? Math.ceil(totalResults / pageSize) : 1;

    let validPage = Math.floor(currentPage);
    if (isNaN(validPage) || validPage < 1) validPage = 1;
    if (validPage > totalPages) validPage = totalPages;

    const startIndex = (validPage - 1) * pageSize;
    const pageResults = accumulatedResults.slice(startIndex, startIndex + pageSize);

    currentResponseState = {
      query: 'test',
      mode: 'local',
      results: pageResults,
      sources: { 'Test': { count: totalResults } },
      pagination: {
        page: validPage,
        pageSize,
        totalResults,
        totalPages,
        hasNextPage: validPage < totalPages,
        hasPreviousPage: validPage > 1,
      },
      meta: { mode: 'local', total: totalResults, executionTimeMs: 10, providers: ['kiwix'] },
    };
  };

  const handleSseEvent = (payload: StreamEventPayload, currentPage: number = 1) => {
    if (payload.event === 'results' || payload.event === 'complete') {
      if (payload.data.results && payload.data.results.length > 0) {
        for (const item of payload.data.results) {
          const dedupeKey = item.id || `${item.source}:${item.title}`;
          if (!seenResultIds.has(dedupeKey)) {
            seenResultIds.add(dedupeKey);
            accumulatedResults.push(item);
          }
        }
      }
      updateResponseState(currentPage);
    }
  };

  const getPageResultIds = (): string[] => {
    if (!currentResponseState || !currentResponseState.results) return [];
    return currentResponseState.results.map(r => r.id);
  };

  // 1. Test Case: Initial SSE [A, B, C], Later SSE [X, Y] -> Order: A, B, C, X, Y
  console.log('1. Testing Append-Only Order Preservation (Initial: [A, B, C], Later: [X, Y])...');
  accumulatedResults.length = 0;
  seenResultIds.clear();

  handleSseEvent({
    event: 'results',
    data: {
      results: [
        { id: 'A', source: 'Source 1', provider: 'kiwix', type: 'article', title: 'A', description: '', url: '' },
        { id: 'B', source: 'Source 1', provider: 'kiwix', type: 'article', title: 'B', description: '', url: '' },
        { id: 'C', source: 'Source 1', provider: 'kiwix', type: 'article', title: 'C', description: '', url: '' },
      ],
    },
  });

  const step1Order = getPageResultIds();
  console.log(`   Initial Rendered Order: ${step1Order.join(', ')}`);

  handleSseEvent({
    event: 'results',
    data: {
      results: [
        { id: 'X', source: 'Source 2', provider: 'kiwix', type: 'article', title: 'X', description: '', url: '' },
        { id: 'Y', source: 'Source 2', provider: 'kiwix', type: 'article', title: 'Y', description: '', url: '' },
      ],
    },
  });

  const step2Order = getPageResultIds();
  console.log(`   Later Rendered Order:   ${step2Order.join(', ')}`);

  if (step2Order.join(', ') !== 'A, B, C, X, Y') {
    console.error(`❌ Test 1 Failed! Expected A, B, C, X, Y, got: ${step2Order.join(', ')}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: Initial rendered positions A, B, C were 100% preserved; X, Y appended after.\n');

  // 2. Test Case: Page Boundary Locking (Initial 20 results -> Page 1 Full -> Later 5 results -> Page 2)
  console.log('2. Testing Page Boundary Locking (Initial 20 results, Later 5 results)...');
  accumulatedResults.length = 0;
  seenResultIds.clear();

  const initial20Results: SearchResult[] = Array.from({ length: 20 }, (_, i) => ({
    id: `item-${i + 1}`,
    source: 'Source 1',
    provider: 'kiwix',
    type: 'article',
    title: `Item ${i + 1}`,
    description: '',
    url: '',
  }));

  handleSseEvent({ event: 'results', data: { results: initial20Results } }, 1);
  const page1Before = getPageResultIds();
  console.log(`   Page 1 (Initial 20 items count): ${page1Before.length} items`);

  const later5Results: SearchResult[] = Array.from({ length: 5 }, (_, i) => ({
    id: `item-${i + 21}`,
    source: 'Source 2',
    provider: 'kiwix',
    type: 'article',
    title: `Item ${i + 21}`,
    description: '',
    url: '',
  }));

  handleSseEvent({ event: 'results', data: { results: later5Results } }, 1);
  const page1After = getPageResultIds();
  console.log(`   Page 1 (After 5 new items arrive): ${page1After.length} items`);

  if (page1Before.join(',') !== page1After.join(',')) {
    console.error('❌ Test 2 Failed! Page 1 items shifted or mutated after later SSE arrival.');
    process.exit(1);
  }
  console.log('   ✅ PASS: Page 1 remained 100% unchanged after later SSE batch arrived.');

  // Check Page 2 content
  updateResponseState(2);
  const page2Items = getPageResultIds();
  console.log(`   Page 2 Content (${page2Items.length} items): ${page2Items.join(', ')}`);
  if (page2Items.join(', ') !== 'item-21, item-22, item-23, item-24, item-25') {
    console.error('❌ Test 2 Failed! Page 2 items incorrect.');
    process.exit(1);
  }
  console.log('   ✅ PASS: Later 5 items went directly to Page 2 without disturbing Page 1.\n');

  // 3. Test Case: Page Navigation Integrity
  console.log('3. Testing Page Navigation (Page 1 -> Page 2 -> Page 1)...');
  updateResponseState(1);
  const p1 = getPageResultIds();
  updateResponseState(2);
  const p2 = getPageResultIds();
  updateResponseState(1);
  const p1Back = getPageResultIds();

  if (p1.join(',') !== p1Back.join(',')) {
    console.error('❌ Test 3 Failed! Navigating between pages reshuffled items.');
    process.exit(1);
  }
  console.log('   ✅ PASS: Navigating between pages preserves accumulated results without reshuffling.\n');

  console.log('====================================================');
  console.log(' ✅ ALL FRONTEND IMMUTABLE APPEND & PAGE LOCK TESTS PASSED!');
  console.log('====================================================');
}

runFrontendOrderingTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
