import { ZimLibrary } from './ZimLibrary.js';
import { SourceRelevance } from './SourceRelevance.js';

async function runDiscoveryTests() {
  console.log('====================================================');
  console.log(' Running Dynamic ZIM Discovery & Two-Stage Relevance Tests');
  console.log('====================================================\n');

  const zimLibrary = new ZimLibrary(
    '/mnt/knowledge/Metadata/library.xml',
    'http://192.168.31.250:8080'
  );

  console.log('1. Testing Dynamic ZIM Discovery...');
  const discovered = await zimLibrary.getDiscoveredSources();

  console.log(`   Discovered ${discovered.length} total ZIM sources.`);
  if (discovered.length === 0) {
    console.error('❌ Dynamic ZIM discovery failed! 0 ZIMs found.');
    process.exit(1);
  }

  const sample = discovered.slice(0, 5);
  console.log('   Sample Discovered ZIM Metadata:');
  sample.forEach((s) => {
    console.log(`   - Title: "${s.name}" | ZIM: "${s.zimName}" | Category: ${s.category}`);
  });
  console.log('   ✅ PASS: Dynamic ZIM discovery successfully loaded catalog entries.\n');

  console.log('2. Testing Two-Stage Source Relevance Selection...');
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

  // Test Case C: "replace iPhone battery" -> should favor iFixit
  const iphoneSelection = relevance.selectRelevantSources('replace iPhone battery', discovered, 8);
  const iphoneSourceNames = iphoneSelection.selectedSources.map(s => s.name);
  console.log(`   Query: "replace iPhone battery"`);
  console.log(`   Selected Sources: ${iphoneSourceNames.join(', ')}`);

  const hasIFixit = iphoneSelection.selectedSources.some(s => s.zimName.includes('ifixit'));
  if (!hasIFixit) {
    console.error('❌ iPhone battery query relevance selection failed!');
    process.exit(1);
  }
  console.log('   ✅ PASS: "replace iPhone battery" correctly selected iFixit.\n');

  console.log('====================================================');
  console.log(' ✅ ALL DYNAMIC DISCOVERY & RELEVANCE TESTS PASSED!');
  console.log('====================================================');
}

runDiscoveryTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
