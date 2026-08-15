import { SearchEngine } from '../src/server/search/SearchEngine.js';
import { KiwixProvider } from '../src/server/search/providers/KiwixProvider.js';
import { config } from '../src/server/config.js';

async function main() {
  console.log('====================================================');
  console.log(' Starting Si4k Search Resource Optimization Audit');
  console.log(' Target Hardware Profile: Intel i5 5th-gen (2C/4T)');
  console.log('====================================================\n');

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

  const queries = ['MongoDB', 'Delhi', 'cook pizza', 'create folder in Arch'];

  console.log('PART 1: 50-Search Memory Leak Audit');
  console.log('----------------------------------------------------');

  const leakLogs: Array<{ step: number; query: string; rssMB: number; heapUsedMB: number }> = [];

  for (let i = 1; i <= 50; i++) {
    const q = queries[(i - 1) % queries.length];
    await engine.searchProgressive(q, { mode: 'local' }, () => {});
    const m = getMem();
    leakLogs.push({ step: i, query: q, rssMB: m.rssMB, heapUsedMB: m.heapUsedMB });

    if (i === 1 || i === 10 || i === 20 || i === 30 || i === 40 || i === 50) {
      console.log(`Search ${i.toString().padStart(2, ' ')} (${q.padEnd(23, ' ')}): RSS=${m.rssMB} MB | HeapUsed=${m.heapUsedMB} MB`);
    }
  }

  console.log('\nPART 2: Concurrency & Workload Benchmarks');
  console.log('----------------------------------------------------');

  const runBenchmark = async (name: string, queryList: string[], concurrency: number) => {
    const memBefore = getMem();
    const cpuBefore = process.cpuUsage();
    const startTime = performance.now();

    if (concurrency === 1) {
      for (const q of queryList) {
        await engine.searchProgressive(q, { mode: 'local' }, () => {});
      }
    } else {
      const promises = queryList.map(q => engine.searchProgressive(q, { mode: 'local' }, () => {}));
      await Promise.all(promises);
    }

    const duration = Math.round(performance.now() - startTime);
    const cpuDelta = process.cpuUsage(cpuBefore);
    const cpuPercent = parseFloat((((cpuDelta.user + cpuDelta.system) / 1000) / duration * 100).toFixed(1));
    const memAfter = getMem();

    console.log(`Scenario: ${name}`);
    console.log(` - Queries: ${queryList.length} | Concurrency: ${concurrency}`);
    console.log(` - Execution Time: ${duration}ms`);
    console.log(` - CPU Usage (Process): ${cpuPercent}% (${(cpuDelta.user / 1000).toFixed(0)}ms user + ${(cpuDelta.system / 1000).toFixed(0)}ms sys)`);
    console.log(` - RSS Before/After: ${memBefore.rssMB} MB / ${memAfter.rssMB} MB`);
    console.log(` - HeapUsed Before/After: ${memBefore.heapUsedMB} MB / ${memAfter.heapUsedMB} MB`);
    console.log(` - Active Sessions: ${engine.getActiveSessionsCount()}`);
    console.log(` - Cache Entries: ${engine.searchCache.size} (${engine.searchCache.estimatedMemoryMB} MB)\n`);
  };

  await runBenchmark('1 Search', ['MongoDB'], 1);
  await runBenchmark('5 Sequential Searches', ['MongoDB', 'Delhi', 'cook pizza', 'create folder in Arch', 'MongoDB'], 1);
  await runBenchmark('10 Sequential Searches', Array(10).fill(0).map((_, i) => queries[i % queries.length]), 1);
  await runBenchmark('10 Concurrent Searches', Array(10).fill(0).map((_, i) => queries[i % queries.length]), 10);
  await runBenchmark('20 Concurrent Searches', Array(20).fill(0).map((_, i) => queries[i % queries.length]), 20);

  console.log('====================================================');
  console.log(' RESOURCE AUDIT & MEMORY LEAK BENCHMARK COMPLETE');
  console.log('====================================================');
}

main().catch(err => {
  console.error('Resource audit error:', err);
  process.exit(1);
});
