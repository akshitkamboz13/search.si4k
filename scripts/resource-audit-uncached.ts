import { SearchEngine } from '../src/server/search/SearchEngine.js';
import { KiwixProvider } from '../src/server/search/providers/KiwixProvider.js';
import { config } from '../src/server/config.js';

async function main() {
  console.log('====================================================');
  console.log(' UNCACHED SEARCH RESOURCE AUDIT & BENCHMARK');
  console.log(' SEARCH_CACHE_ENABLED = false');
  console.log('====================================================\n');

  // Explicitly disable caching for this benchmark run
  config.cache.enabled = false;

  const engine = new SearchEngine();
  const kiwix = new KiwixProvider({
    localUrl: config.kiwix.localUrl,
    localPublicUrl: config.kiwix.localPublicUrl,
    onlineUrl: config.kiwix.onlineUrl,
    onlinePublicUrl: config.kiwix.onlinePublicUrl,
    maxCandidatesPerSource: config.kiwix.candidateLimit,
  });
  engine.registerProvider(kiwix);

  const getMem = () => {
    const m = process.memoryUsage();
    return {
      rssMB: parseFloat((m.rss / (1024 * 1024)).toFixed(2)),
      heapUsedMB: parseFloat((m.heapUsed / (1024 * 1024)).toFixed(2)),
      heapTotalMB: parseFloat((m.heapTotal / (1024 * 1024)).toFixed(2)),
    };
  };

  const queries = [
    'MongoDB', 'Delhi', 'cook pizza', 'create folder in Arch',
    'python tutorial', 'docker setup', 'linux permissions', 'react hooks',
    'postgres backup', 'git rebase', 'nginx config', 'cmake build',
    'golang channels', 'redis cache', 'bash loop', 'systemd service'
  ];

  console.log('PART 1: Uncached Workload & Concurrency Benchmarks');
  console.log('----------------------------------------------------');

  const runUncachedBenchmark = async (
    name: string,
    queryList: string[],
    concurrency: number
  ) => {
    let peakRss = 0;
    let peakHeapUsed = 0;
    let completedSearches = 0;
    let failedSearches = 0;
    let queuedSearches = 0;

    const memBefore = getMem();
    const cpuBefore = process.cpuUsage();
    const startTime = performance.now();

    const trackPeakMem = () => {
      const m = getMem();
      if (m.rssMB > peakRss) peakRss = m.rssMB;
      if (m.heapUsedMB > peakHeapUsed) peakHeapUsed = m.heapUsedMB;
    };

    const executeOne = async (q: string) => {
      if (engine.getActiveSessionsCount() >= config.search.maxConcurrentSessions) {
        queuedSearches++;
      }
      try {
        await engine.searchProgressive(q, { mode: 'local' }, (evt) => {
          trackPeakMem();
          if (evt.event === 'complete') completedSearches++;
          if (evt.event === 'error') failedSearches++;
        });
      } catch {
        failedSearches++;
      }
    };

    if (concurrency === 1) {
      for (const q of queryList) {
        await executeOne(q);
      }
    } else {
      const promises = queryList.map(q => executeOne(q));
      await Promise.all(promises);
    }

    const duration = Math.round(performance.now() - startTime);
    const cpuDelta = process.cpuUsage(cpuBefore);
    const cpuMs = (cpuDelta.user + cpuDelta.system) / 1000;
    const cpuPercent = parseFloat(((cpuMs / duration) * 100).toFixed(1));
    const memAfter = getMem();

    console.log(`Scenario: ${name}`);
    console.log(` - Queries: ${queryList.length} | Concurrency Level: ${concurrency}`);
    console.log(` - Wall-Clock Duration: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
    console.log(` - CPU Utilization (Process): ${cpuPercent}% (${(cpuDelta.user / 1000).toFixed(0)}ms user + ${(cpuDelta.system / 1000).toFixed(0)}ms sys)`);
    console.log(` - Peak RSS: ${Math.max(peakRss, memAfter.rssMB)} MB (Before: ${memBefore.rssMB} MB -> After: ${memAfter.rssMB} MB)`);
    console.log(` - Peak HeapUsed: ${Math.max(peakHeapUsed, memAfter.heapUsedMB)} MB (Before: ${memBefore.heapUsedMB} MB -> After: ${memAfter.heapUsedMB} MB)`);
    console.log(` - Active Sessions (End): ${engine.getActiveSessionsCount()}`);
    console.log(` - Active ZIM Workers (Max Configured): ${config.search.maxZimWorkers}`);
    console.log(` - Queued Searches: ${queuedSearches}`);
    console.log(` - Completed Searches: ${completedSearches}`);
    console.log(` - Failed/Timeouts: ${failedSearches}\n`);
  };

  await runUncachedBenchmark('1 Uncached Search', ['MongoDB v1'], 1);
  await runUncachedBenchmark('5 Sequential Uncached Searches', ['MongoDB v2', 'Delhi v2', 'cook pizza v2', 'create folder v2', 'python tutorial v2'], 1);
  await runUncachedBenchmark('5 Concurrent Uncached Searches', ['MongoDB v3', 'Delhi v3', 'cook pizza v3', 'create folder v3', 'python tutorial v3'], 5);
  await runUncachedBenchmark('10 Concurrent Uncached Searches', Array(10).fill(0).map((_, i) => `Query Batch 4 Item ${i}`), 10);

  console.log('PART 2: 20-Search Sustained Uncached Memory Leak Test');
  console.log('----------------------------------------------------');

  let initialMem = getMem();
  console.log(`Initial RSS: ${initialMem.rssMB} MB | Initial HeapUsed: ${initialMem.heapUsedMB} MB\n`);

  for (let i = 1; i <= 20; i++) {
    const q = `${queries[(i - 1) % queries.length]} sustained ${i}`;
    let completedCount = 0;
    let failedCount = 0;

    await engine.searchProgressive(q, { mode: 'local' }, (evt) => {
      if (evt.event === 'complete') completedCount++;
      if (evt.event === 'error') failedCount++;
    });

    const m = getMem();

    if (i === 1 || i === 5 || i === 10 || i === 15 || i === 20) {
      console.log(`Uncached Search ${i.toString().padStart(2, ' ')} (${q.padEnd(28, ' ')}): RSS=${m.rssMB} MB | HeapUsed=${m.heapUsedMB} MB`);
    }
  }

  console.log('====================================================');
  console.log(' UNCACHED BENCHMARK COMPLETE');
  console.log('====================================================');
}

main().catch(err => {
  console.error('Uncached benchmark error:', err);
  process.exit(1);
});
