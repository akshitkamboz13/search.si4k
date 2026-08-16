import fs from 'fs';
import path from 'path';
import http from 'http';
import { ZimLibrary } from './ZimLibrary.js';

// Helper to create sample Kiwix Atom XML catalog
function createSampleXml(entries: Array<{ id: string; name: string; title: string; description: string; category?: string }>): string {
  const entryNodes = entries.map(e => `
    <entry>
      <id>${e.id}</id>
      <title>${e.title}</title>
      <summary>${e.description}</summary>
      <link href="/content/${e.name}"/>
      <name>${e.name}</name>
      <language>eng</language>
      <category>${e.category || 'general'}</category>
    </entry>
  `).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Kiwix Catalog Test</title>
  ${entryNodes}
</feed>`;
}

async function runReconciliationTests() {
  console.log('====================================================');
  console.log(' Running Runtime ZIM Library Reconciliation Tests');
  console.log('====================================================\n');

  const testDir = path.join(process.cwd(), 'data', 'test-reconciliation-tmp');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const testXmlPath = path.join(testDir, 'library.xml');
  const testIndexPath = path.join(testDir, 'zim-index.json');

  // Start a local mock Kiwix HTTP server
  let catalogXmlContent = createSampleXml([
    { id: '1', name: 'wikipedia_en_test', title: 'Wikipedia Test', description: 'Test Wikipedia ZIM' },
    { id: '2', name: 'archlinux_en_test', title: 'ArchWiki Test', description: 'Test ArchWiki ZIM' },
  ]);
  let fetchCount = 0;
  let serverShouldFail = false;

  const server = http.createServer((req, res) => {
    if (serverShouldFail) {
      res.statusCode = 500;
      res.end('Server Error');
      return;
    }
    if (req.url?.includes('/catalog/v2/entries')) {
      fetchCount++;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/atom+xml');
      res.end(catalogXmlContent);
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const mockServerUrl = `http://127.0.0.1:${address.port}`;

  try {
    // Clean up leftover test index if any
    if (fs.existsSync(testIndexPath)) fs.unlinkSync(testIndexPath);
    if (fs.existsSync(testXmlPath)) fs.unlinkSync(testXmlPath);

    // 1. Initial Discovery
    console.log('1. Testing Initial Discovery...');
    const shortTtlMs = 200; // 200ms TTL for fast test execution
    const zimLibrary = new ZimLibrary(testXmlPath, mockServerUrl, shortTtlMs);

    // Override indexer path to avoid overwriting production zim-index.json
    (zimLibrary as any).zimIndexer.indexPath = testIndexPath;

    let sources = await zimLibrary.getDiscoveredSources();
    console.log(`   Initial sources discovered: ${sources.length}`);
    if (sources.length !== 2 || fetchCount !== 1) {
      console.error(`❌ Initial discovery failed! Expected 2 sources and 1 fetch. Got ${sources.length} sources and ${fetchCount} fetches.`);
      process.exit(1);
    }
    console.log('   ✅ PASS: Initial discovery populated sources correctly.\n');

    // 2. Cached discovery before TTL expires
    console.log('2. Testing Cached Discovery before TTL expires...');
    const prevFetchCount = fetchCount;
    sources = await zimLibrary.getDiscoveredSources();
    if (fetchCount !== prevFetchCount) {
      console.error('❌ Cached discovery failed! Fetch count increased before TTL expired.');
      process.exit(1);
    }
    console.log('   ✅ PASS: Returned cached sources without triggering HTTP request.\n');

    // 3. Refresh after TTL expires
    console.log('3. Testing Refresh after TTL expires...');
    await new Promise(resolve => setTimeout(resolve, shortTtlMs + 50));
    sources = await zimLibrary.getDiscoveredSources();
    if (fetchCount !== prevFetchCount + 1) {
      console.error(`❌ Refresh after TTL failed! Fetch count did not increase (expected ${prevFetchCount + 1}, got ${fetchCount}).`);
      process.exit(1);
    }
    console.log('   ✅ PASS: Re-checked catalog feed after TTL expired.\n');

    // 4. No unnecessary re-index / disk rewrite when catalog hasn't changed
    console.log('4. Testing Deduplication on Unchanged Catalog Feed...');
    let saveIndexCalled = false;
    const origSaveIndex = (zimLibrary as any).zimIndexer.saveIndex.bind((zimLibrary as any).zimIndexer);
    (zimLibrary as any).zimIndexer.saveIndex = (...args: any[]) => {
      saveIndexCalled = true;
      return origSaveIndex(...args);
    };

    await new Promise(resolve => setTimeout(resolve, shortTtlMs + 50));
    await zimLibrary.getDiscoveredSources();
    if (saveIndexCalled) {
      console.error('❌ Unnecessary re-index occurred! saveIndex was called on unchanged catalog feed.');
      process.exit(1);
    }
    console.log('   ✅ PASS: Preserved index without unnecessary re-indexing or disk rewrite.\n');

    // Restore saveIndex
    (zimLibrary as any).zimIndexer.saveIndex = origSaveIndex;

    // 5. Newly added ZIM appears after reconciliation
    console.log('5. Testing Newly Added ZIM Reconciliation...');
    catalogXmlContent = createSampleXml([
      { id: '1', name: 'wikipedia_en_test', title: 'Wikipedia Test', description: 'Test Wikipedia ZIM' },
      { id: '2', name: 'archlinux_en_test', title: 'ArchWiki Test', description: 'Test ArchWiki ZIM' },
      { id: '3', name: 'stackoverflow_en_test', title: 'StackOverflow Test', description: 'Test StackOverflow ZIM', category: 'technology' },
    ]);

    await new Promise(resolve => setTimeout(resolve, shortTtlMs + 50));
    sources = await zimLibrary.getDiscoveredSources();
    const hasStackOverflow = sources.some(s => s.zimName === 'stackoverflow_en_test');
    if (sources.length !== 3 || !hasStackOverflow) {
      console.error(`❌ Added ZIM reconciliation failed! Expected 3 sources including stackoverflow. Got ${sources.length}.`);
      process.exit(1);
    }
    console.log('   ✅ PASS: Newly added ZIM became searchable after reconciliation.\n');

    // 6. Removed ZIM disappears after reconciliation
    console.log('6. Testing Removed ZIM Reconciliation...');
    catalogXmlContent = createSampleXml([
      { id: '1', name: 'wikipedia_en_test', title: 'Wikipedia Test', description: 'Test Wikipedia ZIM' },
      { id: '3', name: 'stackoverflow_en_test', title: 'StackOverflow Test', description: 'Test StackOverflow ZIM', category: 'technology' },
    ]);

    await new Promise(resolve => setTimeout(resolve, shortTtlMs + 50));
    sources = await zimLibrary.getDiscoveredSources();
    const hasArchWiki = sources.some(s => s.zimName === 'archlinux_en_test');
    if (sources.length !== 2 || hasArchWiki) {
      console.error(`❌ Removed ZIM reconciliation failed! ArchWiki still present or total count mismatch (${sources.length}).`);
      process.exit(1);
    }
    console.log('   ✅ PASS: Removed ZIM purged from discovered sources list.\n');

    // 7. Changed ZIM metadata updated
    console.log('7. Testing Changed ZIM Metadata Reconciliation...');
    catalogXmlContent = createSampleXml([
      { id: '1', name: 'wikipedia_en_test', title: 'Wikipedia Updated Title', description: 'Updated Description' },
      { id: '3', name: 'stackoverflow_en_test', title: 'StackOverflow Test', description: 'Test StackOverflow ZIM', category: 'technology' },
    ]);

    await new Promise(resolve => setTimeout(resolve, shortTtlMs + 50));
    sources = await zimLibrary.getDiscoveredSources();
    const updatedWiki = sources.find(s => s.zimName === 'wikipedia_en_test');
    if (!updatedWiki || updatedWiki.title !== 'Wikipedia Updated Title') {
      console.error(`❌ Metadata reconciliation failed! Expected updated title, got '${updatedWiki?.title}'.`);
      process.exit(1);
    }
    console.log('   ✅ PASS: Updated metadata reconciled successfully.\n');

    // 8. Atomic swap of discoveredSources
    console.log('8. Testing Atomic Swap of Discovered Sources...');
    const oldReference = sources;
    catalogXmlContent = createSampleXml([
      { id: '1', name: 'wikipedia_en_test', title: 'Wikipedia Final', description: 'Final' },
    ]);
    await new Promise(resolve => setTimeout(resolve, shortTtlMs + 50));
    const newReference = await zimLibrary.getDiscoveredSources();
    if (oldReference === newReference || oldReference.length === newReference.length) {
      console.error('❌ Atomic swap failed! Reference or content did not swap cleanly.');
      process.exit(1);
    }
    console.log('   ✅ PASS: Source array replaced atomically without mutating previous array reference.\n');

    // 9. Kiwix unavailable during refresh preserves last known-good sources
    console.log('9. Testing Kiwix Unavailable Preserves Last Known-Good Sources...');
    serverShouldFail = true;
    const knownGoodCount = newReference.length;

    await new Promise(resolve => setTimeout(resolve, shortTtlMs + 50));
    sources = await zimLibrary.getDiscoveredSources();
    if (sources.length !== knownGoodCount) {
      console.error(`❌ Preserving last known-good sources failed! Got ${sources.length} sources instead of ${knownGoodCount}.`);
      process.exit(1);
    }
    console.log('   ✅ PASS: Maintained last known-good sources during Kiwix outage.\n');

    // 10. Initial index empty + Kiwix initially unavailable, then available later
    console.log('10. Testing Initial Index Empty -> Unreachable -> Reaches Kiwix Later...');
    serverShouldFail = true;
    const emptyLib = new ZimLibrary('/non-existent/path.xml', mockServerUrl, shortTtlMs);
    (emptyLib as any).zimIndexer.indexPath = path.join(testDir, 'zim-empty-index.json');

    sources = await emptyLib.getDiscoveredSources();
    if (sources.length !== 0) {
      console.error(`❌ Expected empty sources when Kiwix unavailable, got ${sources.length}`);
      process.exit(1);
    }

    // Now restore Kiwix server
    serverShouldFail = false;
    await new Promise(resolve => setTimeout(resolve, shortTtlMs + 50));
    sources = await emptyLib.getDiscoveredSources();
    if (sources.length === 0) {
      console.error('❌ Recovery from initial outage failed! Sources still empty after Kiwix came online.');
      process.exit(1);
    }
    console.log('   ✅ PASS: Successfully recovered and populated index when Kiwix became available later.\n');

    // 11. Concurrent requests do not trigger duplicate refreshes
    console.log('11. Testing Concurrent Request Deduplication...');
    const concurrentLib = new ZimLibrary('/non-existent/path.xml', mockServerUrl, 100);
    (concurrentLib as any).zimIndexer.indexPath = path.join(testDir, 'zim-concurrent-index.json');

    const startFetches = fetchCount;
    await Promise.all([
      concurrentLib.getDiscoveredSources(true),
      concurrentLib.getDiscoveredSources(true),
      concurrentLib.getDiscoveredSources(true),
    ]);
    const endFetches = fetchCount;
    if (endFetches - startFetches !== 1) {
      console.error(`❌ Concurrent deduplication failed! Expected 1 fetch, got ${endFetches - startFetches}.`);
      process.exit(1);
    }
    console.log('   ✅ PASS: Concurrent calls locked properly and shared single refresh promise.\n');

    // 12. Configurable refresh interval
    console.log('12. Testing Configurable Refresh Interval...');
    const customTtlLib = new ZimLibrary(testXmlPath, mockServerUrl, 5000);
    if (customTtlLib.getCacheTtl() !== 5000) {
      console.error(`❌ Configurable TTL failed! Expected 5000ms, got ${customTtlLib.getCacheTtl()}ms.`);
      process.exit(1);
    }
    customTtlLib.setCacheTtl(1500);
    if (customTtlLib.getCacheTtl() !== 1500) {
      console.error(`❌ setCacheTtl failed! Expected 1500ms, got ${customTtlLib.getCacheTtl()}ms.`);
      process.exit(1);
    }
    console.log('   ✅ PASS: Refresh interval is fully configurable.\n');

    // 13. Shutdown token protection
    console.log('13. Testing Shutdown Token Protection...');
    const shutdownLib = new ZimLibrary(testXmlPath, mockServerUrl, 10);
    (shutdownLib as any).zimIndexer.indexPath = path.join(testDir, 'zim-shutdown-index.json');

    // Trigger refresh and immediately call shutdown
    const refreshPromise = shutdownLib.getDiscoveredSources(true);
    shutdownLib.shutdown();
    await refreshPromise;

    if (fs.existsSync(path.join(testDir, 'zim-shutdown-index.json'))) {
      console.error('❌ Shutdown protection failed! zim-shutdown-index.json was written after shutdown.');
      process.exit(1);
    }
    console.log('   ✅ PASS: In-flight refresh discarded results and avoided disk mutation after shutdown.\n');

    // 14. First-run Docker build fallback (no library.xml, no zim-index.json, Kiwix unreachable)
    console.log('14. Testing First-Run Docker Build Fallback & Runtime Reconciliation Recovery...');
    const dockerFallbackIndexPath = path.join(testDir, 'docker-fallback-index.json');
    if (fs.existsSync(dockerFallbackIndexPath)) fs.unlinkSync(dockerFallbackIndexPath);

    // Simulate build-zim-index logic when local file absent, Kiwix offline, and no index exists
    const indexer = (shutdownLib as any).zimIndexer;
    const emptyIndexData = indexer.buildIndex('');
    const origPath = indexer.indexPath;
    indexer.indexPath = dockerFallbackIndexPath;
    indexer.saveIndex(emptyIndexData);
    indexer.indexPath = origPath;

    // Verify empty index file structure created on disk
    if (!fs.existsSync(dockerFallbackIndexPath)) {
      console.error('❌ Docker build fallback failed! Index file was not created.');
      process.exit(1);
    }

    const writtenJson = JSON.parse(fs.readFileSync(dockerFallbackIndexPath, 'utf-8'));
    if (writtenJson.totalSources !== 0 || !Array.isArray(writtenJson.sources) || writtenJson.sources.length !== 0) {
      console.error('❌ Docker build fallback index schema invalid! Expected empty sources array.');
      process.exit(1);
    }

    // Now start ZimLibrary pointing to this fallback index
    serverShouldFail = false;
    const dockerLib = new ZimLibrary('/non-existent/library.xml', mockServerUrl, shortTtlMs);
    (dockerLib as any).zimIndexer.indexPath = dockerFallbackIndexPath;

    // Initial startup reads empty index/unreachable Kiwix
    let dockerSources = await dockerLib.getDiscoveredSources();
    if (dockerSources.length === 0) {
      // Trigger reconciliation after Kiwix server comes online
      await new Promise(resolve => setTimeout(resolve, shortTtlMs + 50));
      dockerSources = await dockerLib.getDiscoveredSources();
    }

    if (dockerSources.length === 0) {
      console.error('❌ Runtime reconciliation failed to populate sources after Docker build fallback!');
      process.exit(1);
    }
    console.log(`   ✅ PASS: First-run Docker fallback generated valid index schema and populated ${dockerSources.length} sources when Kiwix became available.\n`);

  } finally {
    server.close();
    // Clean up temporary test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }

  console.log('====================================================');
  console.log(' ✅ ALL ZIM RECONCILIATION TESTS PASSED!');
  console.log('====================================================');
}

runReconciliationTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
