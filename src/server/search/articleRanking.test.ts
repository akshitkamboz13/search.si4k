import { ArticleScorer } from './ArticleScorer.js';
import { ResultMixer, SourceResultsGroup } from './resultMixer.js';
import { SearchResult } from '../../shared/types.js';

async function runArticleRankingRegressionTests() {
  console.log('====================================================');
  console.log(' Running Query-Aware Cross-ZIM Article Ranking Regression Tests');
  console.log('====================================================\n');

  const mixer = new ResultMixer();

  // Test 1: "cook pizza"
  console.log('1. Testing Query: "cook pizza"...');
  const cookPizzaGroups: SourceResultsGroup[] = [
    {
      sourceId: 'ifixit',
      sourceName: 'iFixit',
      effectivePriority: 9,
      results: [
        {
          id: 'ifixit-1',
          source: 'iFixit in English',
          provider: 'kiwix',
          type: 'article',
          zimName: 'ifixit_en_2026',
          title: 'Pizza Oven Thermocouple Replacement',
          description: 'How to replace a broken thermocouple on a gas pizza oven using standard tools',
          url: 'http://si4k-server.local:8080/content/ifixit/pizza-oven',
        },
      ],
    },
    {
      sourceId: 'recipes',
      sourceName: 'Public Domain Recipes',
      effectivePriority: 5,
      results: [
        {
          id: 'recipe-1',
          source: 'Public Domain Recipes',
          provider: 'kiwix',
          type: 'article',
          zimName: 'recipes_en_2026',
          title: 'How to Cook Homemade Margherita Pizza',
          description: 'Delicious step by step recipe for cooking Italian pizza dough and tomato sauce from scratch',
          url: 'http://si4k-server.local:8080/content/recipes/margherita-pizza',
        },
      ],
    },
    {
      sourceId: 'wikihow',
      sourceName: 'wikiHow',
      effectivePriority: 9,
      results: [
        {
          id: 'wikihow-1',
          source: 'wikiHow',
          provider: 'kiwix',
          type: 'article',
          zimName: 'wikihow_en_2026',
          title: '3 Ways to Cook Crisp Pizza in an Oven',
          description: 'How to bake and cook perfect pizza at home with crisp crust',
          url: 'http://si4k-server.local:8080/content/wikihow/cook-pizza',
        },
      ],
    },
  ];

  const mixedPizza = mixer.mixResults(cookPizzaGroups, 10, 'cook pizza');
  console.log(`   Top 3 Articles for "cook pizza":`);
  mixedPizza.slice(0, 3).forEach((r, i) => {
    console.log(`     ${i + 1}. "${r.title}" (${r.source}) [finalScore=${r.finalScore}]`);
  });

  if (mixedPizza[0].source === 'iFixit in English') {
    console.error('❌ Test 1 Failed! iFixit wrongly outranked cooking sources for "cook pizza".');
    process.exit(1);
  }
  if (!mixedPizza[0].source.includes('Recipes') && !mixedPizza[0].source.includes('wikiHow')) {
    console.error(`❌ Test 1 Failed! Expected Cooking/Recipe source at #1, got: ${mixedPizza[0].source}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: "cook pizza" correctly ranked cooking/recipe sources above iFixit.\n');

  // Test 2: "repair phone screen"
  console.log('2. Testing Query: "repair phone screen"...');
  const repairPhoneGroups: SourceResultsGroup[] = [
    {
      sourceId: 'ifixit',
      sourceName: 'iFixit',
      effectivePriority: 9,
      results: [
        {
          id: 'ifixit-screen',
          source: 'iFixit in English',
          provider: 'kiwix',
          type: 'article',
          zimName: 'ifixit_en_2026',
          title: 'iPhone 13 Screen Replacement & Screen Repair',
          description: 'Teardown and repair guide for replacing a cracked smartphone screen',
          url: 'http://si4k-server.local:8080/content/ifixit/screen-repair',
        },
      ],
    },
    {
      sourceId: 'recipes',
      sourceName: 'Public Domain Recipes',
      effectivePriority: 5,
      results: [
        {
          id: 'recipe-screen',
          source: 'Public Domain Recipes',
          provider: 'kiwix',
          type: 'article',
          zimName: 'recipes_en_2026',
          title: 'Screen-Door Sugar Cookie Recipe',
          description: 'Bake sugar cookies shaped like a screen door',
          url: 'http://si4k-server.local:8080/content/recipes/cookie',
        },
      ],
    },
  ];

  const mixedRepair = mixer.mixResults(repairPhoneGroups, 10, 'repair phone screen');
  console.log(`   Top Article for "repair phone screen": "${mixedRepair[0].title}" (${mixedRepair[0].source}) [finalScore=${mixedRepair[0].finalScore}]`);
  if (mixedRepair[0].source !== 'iFixit in English') {
    console.error(`❌ Test 2 Failed! Expected iFixit at #1, got ${mixedRepair[0].source}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: "repair phone screen" correctly ranked iFixit above cooking sources.\n');

  // Test 3: "create folder in Arch"
  console.log('3. Testing Query: "create folder in Arch"...');
  const archGroups: SourceResultsGroup[] = [
    {
      sourceId: 'arch',
      sourceName: 'ArchWiki',
      effectivePriority: 9,
      results: [
        {
          id: 'arch-folder',
          source: 'ArchWiki',
          provider: 'kiwix',
          type: 'article',
          zimName: 'archlinux_en_2026',
          title: 'File System Hierarchy & Creating Directories in Arch Linux',
          description: 'How to create folders and manage permissions using mkdir in Arch Linux',
          url: 'http://si4k-server.local:8080/content/arch/mkdir',
        },
      ],
    },
    {
      sourceId: 'ifixit',
      sourceName: 'iFixit',
      effectivePriority: 5,
      results: [
        {
          id: 'ifixit-arch',
          source: 'iFixit in English',
          provider: 'kiwix',
          type: 'article',
          zimName: 'ifixit_en_2026',
          title: 'Building a Wooden Arch for Garden Repair',
          description: 'How to repair and create a garden arch out of wood',
          url: 'http://si4k-server.local:8080/content/ifixit/garden-arch',
        },
      ],
    },
  ];

  const mixedArch = mixer.mixResults(archGroups, 10, 'create folder in Arch');
  console.log(`   Top Article for "create folder in Arch": "${mixedArch[0].title}" (${mixedArch[0].source}) [finalScore=${mixedArch[0].finalScore}]`);
  if (mixedArch[0].source !== 'ArchWiki') {
    console.error(`❌ Test 3 Failed! Expected ArchWiki at #1, got ${mixedArch[0].source}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: "create folder in Arch" correctly ranked ArchWiki above unrelated sources.\n');

  // Test 4: "how to make tea"
  console.log('4. Testing Query: "how to make tea"...');
  const teaGroups: SourceResultsGroup[] = [
    {
      sourceId: 'wikihow',
      sourceName: 'wikiHow',
      effectivePriority: 9,
      results: [
        {
          id: 'wikihow-tea',
          source: 'wikiHow',
          provider: 'kiwix',
          type: 'article',
          zimName: 'wikihow_en_2026',
          title: 'How to Make Herbal Tea from Scratch',
          description: 'Step by step instructions for brewing and making delicious hot tea',
          url: 'http://si4k-server.local:8080/content/wikihow/make-tea',
        },
      ],
    },
    {
      sourceId: 'ifixit',
      sourceName: 'iFixit',
      effectivePriority: 5,
      results: [
        {
          id: 'ifixit-kettle',
          source: 'iFixit in English',
          provider: 'kiwix',
          type: 'article',
          zimName: 'ifixit_en_2026',
          title: 'Electric Tea Kettle Heating Element Repair',
          description: 'How to fix tea kettle heating element when it stops boiling water',
          url: 'http://si4k-server.local:8080/content/ifixit/kettle-repair',
        },
      ],
    },
  ];

  const mixedTea = mixer.mixResults(teaGroups, 10, 'how to make tea');
  console.log(`   Top Article for "how to make tea": "${mixedTea[0].title}" (${mixedTea[0].source}) [finalScore=${mixedTea[0].finalScore}]`);
  if (mixedTea[0].source !== 'wikiHow') {
    console.error(`❌ Test 4 Failed! Expected wikiHow at #1, got ${mixedTea[0].source}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: "how to make tea" correctly ranked wikiHow/cooking sources above iFixit.\n');

  // Test 5: Source Diversity Interleaving (Consecutive Same-Site Limit)
  console.log('5. Testing Source Diversity Interleaving (Max 2 Consecutive per Site)...');
  const diversityGroups: SourceResultsGroup[] = [
    {
      sourceId: 'wikipedia',
      sourceName: 'Wikipedia',
      effectivePriority: 8,
      results: Array.from({ length: 5 }, (_, i) => ({
        id: `wiki-${i}`,
        source: 'Wikipedia',
        provider: 'kiwix',
        type: 'article',
        zimName: 'wikipedia_en',
        title: `Python Programming Concept ${i + 1}`,
        description: 'Comprehensive Python programming guide',
        url: `http://localhost/content/wiki/python-${i}`,
      })),
    },
    {
      sourceId: 'wikihow',
      sourceName: 'wikiHow',
      effectivePriority: 8,
      results: Array.from({ length: 3 }, (_, i) => ({
        id: `wikihow-${i}`,
        source: 'wikiHow',
        provider: 'kiwix',
        type: 'article',
        zimName: 'wikihow_en',
        title: `How to Learn Python ${i + 1}`,
        description: 'Step by step guide to learning Python programming',
        url: `http://localhost/content/wikihow/python-${i}`,
      })),
    },
    {
      sourceId: 'ifixit',
      sourceName: 'iFixit',
      effectivePriority: 5,
      results: [
        {
          id: 'ifixit-1',
          source: 'iFixit',
          provider: 'kiwix',
          type: 'article',
          zimName: 'ifixit_en',
          title: 'Python Board Hardware Setup',
          description: 'Hardware repair for Python development boards',
          url: 'http://localhost/content/ifixit/python-board',
        },
      ],
    },
  ];

  const mixedDiversity = mixer.mixResults(diversityGroups, 10, 'python programming');
  console.log('   Interleaved Diversity Order (Top 8):');
  mixedDiversity.slice(0, 8).forEach((r, i) => {
    console.log(`     ${i + 1}. "${r.title}" (${r.source})`);
  });

  // Verify no 3 consecutive items from the exact same source
  let maxConsecutive = 0;
  let currentStreak = 0;
  let prevSource = '';
  for (const item of mixedDiversity) {
    if (item.source === prevSource) {
      currentStreak++;
    } else {
      prevSource = item.source;
      currentStreak = 1;
    }
    maxConsecutive = Math.max(maxConsecutive, currentStreak);
  }

  if (maxConsecutive > 2) {
    console.error(`❌ Test 5 Failed! Found ${maxConsecutive} consecutive results from the same source (expected <= 2).`);
    process.exit(1);
  }
  console.log('   ✅ PASS: Source diversity interleaving successfully capped consecutive same-site items at 2.\n');

  console.log('====================================================');
  console.log(' ✅ ALL ARTICLE RANKING REGRESSION TESTS PASSED!');
  console.log('====================================================');
}

runArticleRankingRegressionTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
