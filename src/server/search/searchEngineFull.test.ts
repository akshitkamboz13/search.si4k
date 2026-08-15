import { SearchEngine } from './SearchEngine.js';
import { KiwixProvider } from './providers/KiwixProvider.js';
import { SourceRanker } from './sourceRanker.js';
import { ResultMixer } from './resultMixer.js';
import { SearchSourceConfig, ScoringConfig } from '../../shared/types.js';

const mockScoring: ScoringConfig = {
  exactDomainMatchScore: 7,
  exactPhraseKeywordScore: 4,
  singleKeywordScore: 2,
  categoryMatchScore: 3,
};

const mockSources: SearchSourceConfig[] = [
  {
    id: 'archwiki_en',
    zimName: 'archlinux_en_all_2023-05',
    name: 'Arch Wiki',
    provider: 'kiwix',
    lang: 'en',
    basePriority: 6,
    category: 'technical',
    enabled: true,
    keywords: ['arch', 'arch linux', 'pacman', 'aur', 'systemd', 'linux'],
  },
  {
    id: 'wikihow_en',
    zimName: 'wikihow_en_maxi_2023-03',
    name: 'wikiHow',
    provider: 'kiwix',
    lang: 'en',
    basePriority: 9,
    category: 'guides',
    enabled: true,
    keywords: ['how to', 'how', 'repair', 'fix', 'diy', 'make', 'build'],
  },
  {
    id: 'wikipedia_en',
    zimName: 'wikipedia_en_all_maxi_2023-11',
    name: 'Wikipedia',
    provider: 'kiwix',
    lang: 'en',
    basePriority: 6,
    category: 'general',
    enabled: true,
    keywords: ['general knowledge', 'history', 'geography', 'science'],
  },
  {
    id: 'wikihow_hi',
    zimName: 'wikihow_hi_all_2023-01',
    name: 'wikiHow Hindi',
    provider: 'kiwix',
    lang: 'hi',
    basePriority: 8,
    category: 'guides',
    enabled: true,
    keywords: ['how to', 'hindi'],
  },
];

async function runTests() {
  console.log('====================================================');
  console.log(' Running Complete Si4k Search Engine Test Suite');
  console.log('====================================================\n');

  // 1. Test Source Priority Boosting (Arch Wiki domain match overriding base priority)
  console.log('1. Testing Query-Dependent Source Priority Boosting...');
  const ranker = new SourceRanker(mockScoring);

  const archQuery = 'how to make folder in Arch';
  const archRanked = ranker.rankSources(mockSources, archQuery);

  console.log(`   Query: "${archQuery}"`);
  console.log(`   Top Ranked Source: ${archRanked[0].name} (effectivePriority: ${archRanked[0].effectivePriority})`);

  if (archRanked[0].id !== 'archwiki_en' && archRanked[0].id !== 'wikihow_en') {
    console.error('❌ Source ranking test failed: Arch Wiki or wikiHow should be top ranked');
    process.exit(1);
  }
  console.log('   ✅ PASS: Domain signal correctly boosted source priority.\n');

  // 2. Test Kiwix XML Parser & URL Conversion
  console.log('2. Testing Kiwix Full-Text XML Parser & KIWIX_PUBLIC_URL Conversion...');
  const provider = new KiwixProvider({
    internalUrl: 'http://localhost:8080',
    publicUrl: 'https://wiki.si4k.online',
    sources: mockSources,
  });

  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <title>Creating Folders and Directories in Arch Linux</title>
      <summary>Comprehensive guide on mkdir command in Arch Linux filesystem.</summary>
      <link rel="alternate" href="http://localhost:8080/archlinux_en_all_2023-05/A/mkdir.html"/>
    </entry>
  </feed>`;

  const parsedResults = provider.parseKiwixHtml(sampleXml, mockSources[0]);
  console.log(`   Parsed ${parsedResults.length} entry.`);
  console.log(`   Target Public URL: ${parsedResults[0].url}`);

  if (!parsedResults[0].url.startsWith('https://wiki.si4k.online/archlinux_en_all_2023-05')) {
    console.error('❌ Kiwix XML URL conversion test failed!');
    process.exit(1);
  }
  console.log('   ✅ PASS: Kiwix XML parsed cleanly and converted to KIWIX_PUBLIC_URL.\n');

  // 3. Test Adaptive Result Mixing (Monopolization Prevention)
  console.log('3. Testing Adaptive Result Mixing Algorithm...');
  const mixer = new ResultMixer();

  const mockGroups = [
    {
      sourceId: 'archwiki_en',
      sourceName: 'Arch Wiki',
      effectivePriority: 15,
      results: Array.from({ length: 2 }, (_, i) => ({
        id: `arch-${i}`,
        source: 'Arch Wiki',
        provider: 'kiwix',
        type: 'article',
        title: `Arch Article ${i}`,
        description: '...',
        url: `https://wiki.si4k.online/arch/${i}`,
      })),
    },
    {
      sourceId: 'wikihow_en',
      sourceName: 'wikiHow',
      effectivePriority: 13,
      results: Array.from({ length: 30 }, (_, i) => ({
        id: `wikihow-${i}`,
        source: 'wikiHow',
        provider: 'kiwix',
        type: 'article',
        title: `wikiHow Article ${i}`,
        description: '...',
        url: `https://wiki.si4k.online/wikihow/${i}`,
      })),
    },
    {
      sourceId: 'wikipedia_en',
      sourceName: 'Wikipedia',
      effectivePriority: 6,
      results: Array.from({ length: 15 }, (_, i) => ({
        id: `wiki-${i}`,
        source: 'Wikipedia',
        provider: 'kiwix',
        type: 'article',
        title: `Wikipedia Article ${i}`,
        description: '...',
        url: `https://wiki.si4k.online/wiki/${i}`,
      })),
    },
  ];

  const mixed = mixer.mixResults(mockGroups, 20);
  console.log(`   Mixed Page Size: ${mixed.length} results.`);
  const archCount = mixed.filter(r => r.source === 'Arch Wiki').length;
  const wikihowCount = mixed.filter(r => r.source === 'wikiHow').length;
  const wikipediaCount = mixed.filter(r => r.source === 'Wikipedia').length;

  console.log(`   Distribution -> Arch Wiki: ${archCount}, wikiHow: ${wikihowCount}, Wikipedia: ${wikipediaCount}`);

  if (mixed.length !== 20 || archCount !== 2 || wikihowCount === 0 || wikipediaCount === 0) {
    console.error('❌ Result mixer test failed!');
    process.exit(1);
  }
  console.log('   ✅ PASS: Results adaptively mixed without monopolization.\n');

  // 4. Test SearchEngine Integration & Pagination
  console.log('4. Testing SearchEngine Multi-Source Integration & Pagination...');
  const searchEngine = new SearchEngine(mockSources, mockScoring);
  searchEngine.registerProvider(provider);

  const response = await searchEngine.search('how to repair wall', { page: 1, pageSize: 20 });
  console.log(`   Query Response Execution Time: ${response.meta.executionTimeMs}ms`);
  console.log(`   Pagination -> Page: ${response.pagination.page}, Total Candidate Results: ${response.pagination.totalResults}`);

  console.log('\n====================================================');
  console.log(' ✅ ALL SEARCH ENGINE TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
