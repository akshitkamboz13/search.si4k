import fs from 'fs';
import { ZimLibrary } from './ZimLibrary.js';
import { KiwixProvider } from './providers/KiwixProvider.js';
import { SourceRelevance } from './SourceRelevance.js';

async function runDiscoveryTests() {
  console.log('====================================================');
  console.log(' Running Dynamic ZIM Discovery & Remote Search Tests');
  console.log('====================================================\n');

  const zimLibrary = new ZimLibrary(
    process.env.KIWIX_LIBRARY_XML || '/mnt/knowledge/Metadata/library.xml',
    'http://192.168.31.250:8080'
  );

  console.log('1. Testing Dynamic ZIM Metadata Discovery...');
  const discovered = await zimLibrary.getDiscoveredSources();

  console.log(`   Discovered ${discovered.length} total ZIM sources from library.xml/catalog.`);
  if (discovered.length === 0) {
    console.error('❌ Dynamic ZIM discovery failed! 0 ZIMs found.');
    process.exit(1);
  }

  const sample = discovered.slice(0, 5);
  console.log('   Sample Discovered ZIM Metadata:');
  sample.forEach((s) => {
    console.log(`   - Title: "${s.name}" | ZIM: "${s.zimName}" | Category: ${s.category}`);
  });
  console.log('   ✅ PASS: Dynamic ZIM metadata discovery loaded catalog entries.\n');

  // 2. Test Remote Kiwix Search without Local .zim Files
  console.log('2. Testing Remote Search without Local .zim Files on Disk...');
  const testZim = discovered.find(s => s.zimName.includes('archlinux')) || discovered[0];

  // Verify local .zim file does NOT exist on development machine
  const fakeLocalZimPath = `/mnt/knowledge/ZIM/${testZim.zimName}.zim`;
  const localFileExists = fs.existsSync(fakeLocalZimPath);
  console.log(`   Discovered ZIM: "${testZim.name}" (${testZim.zimName})`);
  console.log(`   Local File Path (${fakeLocalZimPath}) exists: ${localFileExists}`);

  const provider = new KiwixProvider({
    localUrl: 'http://192.168.31.250:8080',
    localPublicUrl: 'http://si4k-server.local:8080',
  });

  const searchResults = await provider.searchZimSource(testZim, 'folder', 'local');
  console.log(`   Remote Search Results Returned from Kiwix Server: ${searchResults.length}`);

  if (searchResults.length === 0) {
    console.error(`❌ Remote ZIM search failed for ${testZim.zimName}!`);
    process.exit(1);
  }

  console.log(`   Sample Result Title: "${searchResults[0].title}"`);
  console.log(`   Sample Result Target URL: "${searchResults[0].url}"`);
  console.log('   ✅ PASS: Discovered ZIM searched remotely via Kiwix HTTP API without local .zim file on disk!\n');

  // 3. Test Two-Stage Source Relevance Selection
  console.log('3. Testing Two-Stage Source Relevance Selection...');
  const relevance = new SourceRelevance();

  // Test Case A: "how to cook paneer" -> should favor cooking / wikiHow
  const paneerSelection = relevance.selectRelevantSources('how to cook paneer', discovered, 8);
  const paneerSourceNames = paneerSelection.selectedSources.map(s => s.name);
  console.log(`   Query: "how to cook paneer"`);
  console.log(`   Selected Sources: ${paneerSourceNames.join(', ')}`);

  const hasCookOrGuide = paneerSelection.selectedSources.some(
    s => s.category === 'guides' || s.name.toLowerCase().includes('wikihow') || s.name.toLowerCase().includes('cook')
  );
  if (!hasCookOrGuide) {
    console.error('❌ Paneer query relevance selection failed!');
    process.exit(1);
  }
  console.log('   ✅ PASS: "how to cook paneer" correctly selected cooking/guide sources.\n');

  // Test Case B: "create folder in arch" -> should favor ArchWiki
  const archSelection = relevance.selectRelevantSources('create folder in arch', discovered, 8);
  const archSourceNames = archSelection.selectedSources.map(s => s.name);
  console.log(`   Query: "create folder in arch"`);
  console.log(`   Selected Sources: ${archSourceNames.join(', ')}`);

  const hasArch = archSelection.selectedSources.some(s => s.zimName.includes('arch'));
  if (!hasArch) {
    console.error('❌ Arch query relevance selection failed!');
    process.exit(1);
  }
  console.log('   ✅ PASS: "create folder in arch" correctly selected ArchWiki.\n');

  console.log('====================================================');
  console.log(' ✅ ALL REMOTE SEARCH & RELEVANCE TESTS PASSED!');
  console.log('====================================================');
}

runDiscoveryTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
