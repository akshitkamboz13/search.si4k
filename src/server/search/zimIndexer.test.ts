import fs from 'fs';
import path from 'path';
import { ZimIndexer } from './ZimIndexer.js';
import { SourceRelevance } from './SourceRelevance.js';

async function runIndexerTests() {
  console.log('====================================================');
  console.log(' Running Prebuilt ZIM Category Indexing & Intent Tests');
  console.log('====================================================\n');

  const libraryPath = process.env.KIWIX_LIBRARY_XML || '/home/siakshit/kiwix-test/Metadata/library.xml';
  const testIndexPath = path.join(process.cwd(), 'data', 'zim-index-test.json');

  const indexer = new ZimIndexer(libraryPath, testIndexPath);

  console.log('1. Testing Index Generation & Parent Category Extraction...');
  const xmlContent = fs.readFileSync(libraryPath, 'utf-8');
  const indexData = indexer.buildIndex(xmlContent);

  console.log(`   Total Discovered ZIMs Indexed: ${indexData.totalSources}`);
  if (indexData.totalSources === 0) {
    console.error('❌ ZimIndexer generated 0 sources!');
    process.exit(1);
  }

  const sampleSource = indexData.sources.find(s => s.zimName.includes('archlinux')) || indexData.sources[0];
  console.log(`   Sample Source: ${sampleSource.title} (${sampleSource.zimName})`);
  console.log(`   Parent Category: ${sampleSource.parentCategory}`);
  console.log(`   Categories: ${sampleSource.categories.join(', ')}`);
  console.log(`   Keywords Count: ${sampleSource.keywords.length}`);

  if (!sampleSource.categories || sampleSource.categories.length === 0) {
    console.error('❌ Sample source categories extraction failed!');
    process.exit(1);
  }
  console.log('   ✅ PASS: Prebuilt ZIM index generated metadata correctly.\n');

  console.log('2. Testing Query Intent Categorization...');
  // Test Case A: "how to fix car engine" -> automotive / repair
  const catCar = indexer.categorizeQuery('how to fix car engine');
  console.log('   Query: "how to fix car engine" -> Categories:', catCar);
  if (!catCar['automotive'] || !catCar['repair']) {
    console.error('❌ "how to fix car engine" category intent failed!');
    process.exit(1);
  }
  console.log('   ✅ PASS: "how to fix car engine" matched automotive and repair.\n');

  // Test Case B: "what to do for fever" -> medicine
  const catFever = indexer.categorizeQuery('what to do for fever');
  console.log('   Query: "what to do for fever" -> Categories:', catFever);
  if (!catFever['medicine']) {
    console.error('❌ "what to do for fever" category intent failed!');
    process.exit(1);
  }
  console.log('   ✅ PASS: "what to do for fever" matched medicine.\n');

  // Test Case C: "create folder in arch" -> linux
  const catArch = indexer.categorizeQuery('create folder in arch');
  console.log('   Query: "create folder in arch" -> Categories:', catArch);
  if (!catArch['linux']) {
    console.error('❌ "create folder in arch" category intent failed!');
    process.exit(1);
  }
  console.log('   ✅ PASS: "create folder in arch" matched linux.\n');

  console.log('3. Testing Source Relevance Scoring with Prebuilt Index...');
  const relevance = new SourceRelevance();
  const mockDiscovered = indexData.sources.map((s, idx) => ({
    id: `zim-${idx}-${s.zimName}`,
    zimName: s.zimName,
    name: s.title,
    title: s.title,
    provider: 'kiwix',
    lang: s.language,
    basePriority: s.basePriority,
    category: s.categories[0] || 'general',
    parentCategory: s.parentCategory,
    categories: s.categories,
    enabled: true,
    keywords: s.keywords,
    tags: s.tags,
    description: s.description,
  }));

  const carSelection = relevance.selectRelevantSources('how to fix car engine', mockDiscovered, 8);
  console.log('   Top Selected Sources for "how to fix car engine":', carSelection.selectedSources.map(s => s.name).join(', '));

  console.log('====================================================');
  console.log(' ✅ ALL PREBUILT ZIM INDEXING & INTENT TESTS PASSED!');
  console.log('====================================================');
}

runIndexerTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
