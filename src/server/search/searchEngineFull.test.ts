import { SourceRanker } from './sourceRanker.js';
import { ResultMixer } from './resultMixer.js';
import { SearchSourceConfig, ScoringConfig } from '../../shared/types.js';

const mockScoring: ScoringConfig = {
  exactDomainMatchScore: 7,
  exactPhraseKeywordScore: 4,
  singleKeywordScore: 2,
  categoryMatchScore: 3,
};

const testSources: SearchSourceConfig[] = [
  {
    id: 'archwiki_en_2026_07',
    zimName: 'archlinux_en_all_maxi_2026-07',
    name: 'Arch Wiki',
    provider: 'kiwix',
    lang: 'en',
    basePriority: 6,
    category: 'technical',
    enabled: true,
    keywords: ['arch', 'arch linux', 'pacman', 'aur', 'systemd', 'linux', 'terminal', 'bash', 'folder', 'directory'],
  },
  {
    id: 'wikihow_en_2023_03',
    zimName: 'wikihow_en_maxi_2023-03',
    name: 'wikiHow',
    provider: 'kiwix',
    lang: 'en',
    basePriority: 9,
    category: 'guides',
    enabled: true,
    keywords: ['how to', 'how', 'repair', 'fix', 'diy', 'make', 'create', 'build', 'step by step'],
  },
  {
    id: 'ifixit_en_2025_12',
    zimName: 'ifixit_en_all_2025-12',
    name: 'iFixit',
    provider: 'kiwix',
    lang: 'en',
    basePriority: 9,
    category: 'repair',
    enabled: true,
    keywords: ['repair', 'replace', 'battery', 'screen', 'teardown', 'hardware', 'tool', 'part', 'wall', 'fix'],
  },
  {
    id: 'wikipedia_en_2026_06',
    zimName: 'wikipedia_en_all_nopic_2026-06',
    name: 'Wikipedia',
    provider: 'kiwix',
    lang: 'en',
    basePriority: 6,
    category: 'general',
    enabled: true,
    keywords: ['general knowledge', 'history', 'geography', 'science', 'biography', 'overview', 'capital', 'france', 'city'],
  },
];

async function runTests() {
  console.log('====================================================');
  console.log(' Running SearchEngine Priority Ranking & Mixing Tests');
  console.log('====================================================\n');

  const ranker = new SourceRanker(mockScoring);

  // Test Case 1: "create folder in arch" -> Arch Wiki outranks wikiHow and Wikipedia
  console.log('1. Testing Query: "create folder in arch"...');
  const q1Ranked = ranker.rankSources(testSources, 'create folder in arch');
  console.log(`   Top Source: ${q1Ranked[0].name} (effectivePriority: ${q1Ranked[0].effectivePriority})`);
  console.log(`   Ranked Order: ${q1Ranked.map(s => `${s.name} (${s.effectivePriority})`).join(' > ')}`);

  if (q1Ranked[0].name !== 'Arch Wiki') {
    console.error(`❌ Test 1 Failed! Expected Arch Wiki to be top ranked, got ${q1Ranked[0].name}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: "create folder in arch" correctly prioritized Arch Wiki as top source.\n');

  // Test Case 2: "how to repair a wall" -> wikiHow / iFixit high priority
  console.log('2. Testing Query: "how to repair a wall"...');
  const q2Ranked = ranker.rankSources(testSources, 'how to repair a wall');
  console.log(`   Top Source: ${q2Ranked[0].name} (effectivePriority: ${q2Ranked[0].effectivePriority})`);
  console.log(`   Ranked Order: ${q2Ranked.map(s => `${s.name} (${s.effectivePriority})`).join(' > ')}`);

  const topTwoNames = [q2Ranked[0].name, q2Ranked[1].name];
  if (!topTwoNames.includes('wikiHow') || !topTwoNames.includes('iFixit')) {
    console.error(`❌ Test 2 Failed! Expected wikiHow/iFixit in top two, got ${topTwoNames.join(', ')}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: "how to repair a wall" correctly prioritized wikiHow and iFixit.\n');

  // Test Case 3: "capital of france" -> Wikipedia high priority
  console.log('3. Testing Query: "capital of france"...');
  const q3Ranked = ranker.rankSources(testSources, 'capital of france');
  console.log(`   Top Source: ${q3Ranked[0].name} (effectivePriority: ${q3Ranked[0].effectivePriority})`);
  console.log(`   Ranked Order: ${q3Ranked.map(s => `${s.name} (${s.effectivePriority})`).join(' > ')}`);

  if (q3Ranked[0].name !== 'Wikipedia') {
    console.error(`❌ Test 3 Failed! Expected Wikipedia to be top ranked, got ${q3Ranked[0].name}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: "capital of france" correctly prioritized Wikipedia.\n');

  // Test Case 4: Adaptive Result Mixing (Page Size 20)
  console.log('4. Testing Adaptive Result Mixing...');
  const mixer = new ResultMixer();
  const mockGroups = [
    {
      sourceId: 'archwiki_en_2026_07',
      sourceName: 'Arch Wiki',
      effectivePriority: 17,
      results: Array.from({ length: 4 }, (_, i) => ({
        id: `arch-${i}`,
        source: 'Arch Wiki',
        provider: 'kiwix',
        type: 'article',
        title: `Arch Article ${i}`,
        description: '...',
        url: `http://192.168.31.250:8080/content/archlinux_en_all_maxi_2026-07/Arch_${i}`,
      })),
    },
    {
      sourceId: 'wikihow_en_2023_03',
      sourceName: 'wikiHow',
      effectivePriority: 15,
      results: Array.from({ length: 25 }, (_, i) => ({
        id: `wikihow-${i}`,
        source: 'wikiHow',
        provider: 'kiwix',
        type: 'article',
        title: `wikiHow Article ${i}`,
        description: '...',
        url: `http://192.168.31.250:8080/content/wikihow_en_maxi_2023-03/wikiHow_${i}`,
      })),
    },
    {
      sourceId: 'wikipedia_en_2026_06',
      sourceName: 'Wikipedia',
      effectivePriority: 8,
      results: Array.from({ length: 20 }, (_, i) => ({
        id: `wiki-${i}`,
        source: 'Wikipedia',
        provider: 'kiwix',
        type: 'article',
        title: `Wikipedia Article ${i}`,
        description: '...',
        url: `http://192.168.31.250:8080/content/wikipedia_en_all_nopic_2026-06/Wiki_${i}`,
      })),
    },
  ];

  const mixed = mixer.mixResults(mockGroups, 20);
  console.log(`   Mixed Total Results: ${mixed.length}`);
  const archCount = mixed.filter(r => r.source === 'Arch Wiki').length;
  const wikihowCount = mixed.filter(r => r.source === 'wikiHow').length;
  const wikipediaCount = mixed.filter(r => r.source === 'Wikipedia').length;

  console.log(`   Mixed Counts -> Arch Wiki: ${archCount}, wikiHow: ${wikihowCount}, Wikipedia: ${wikipediaCount}`);

  if (mixed.length !== 20 || archCount !== 4 || wikihowCount === 0 || wikipediaCount === 0) {
    console.error('❌ Result mixing test failed!');
    process.exit(1);
  }
  console.log('   ✅ PASS: Adaptive mixing dynamically allocated slots correctly.\n');

  console.log('====================================================');
  console.log(' ✅ ALL PRIORITY RANKING & MIXING TESTS PASSED!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
