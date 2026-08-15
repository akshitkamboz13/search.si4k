import { SourceRelevance } from './SourceRelevance.js';
import { DiscoveredZim } from './ZimLibrary.js';

async function runQueryRoutingTests() {
  console.log('====================================================');
  console.log(' Running Refactored Query Intent Routing & Weighting Tests');
  console.log('====================================================\n');

  const relevance = new SourceRelevance();

  const mockDiscovered: DiscoveredZim[] = [
    {
      id: 'zim-arch',
      zimName: 'archlinux_en_all_maxi_2026-07',
      name: 'Arch Wiki',
      title: 'Arch Linux Wiki',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 8,
      category: 'linux',
      parentCategory: 'Linux',
      categories: ['linux', 'programming', 'technology'],
      enabled: true,
      keywords: ['arch', 'arch linux', 'pacman', 'aur', 'systemd', 'bash', 'terminal'],
      tags: ['linux', 'arch', 'systemd', 'pacman'],
      description: 'Arch Linux official wiki documentation',
    },
    {
      id: 'zim-india-history',
      zimName: 'gutenberg_en_indian_history_2026',
      name: 'Indian History Collection',
      title: 'History of India and Civilization',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 6,
      category: 'history',
      parentCategory: 'History',
      categories: ['india', 'history'],
      enabled: true,
      keywords: ['india', 'indian', 'history', 'civilization', 'mughal', 'empire'],
      tags: ['india', 'history'],
      description: 'Comprehensive historical accounts of ancient and modern India',
    },
    {
      id: 'zim-car-repair',
      zimName: 'auto_repair_en_2026',
      name: 'Automotive Engine Repair',
      title: 'Car Maintenance and Engine Fixes',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 7,
      category: 'automotive',
      parentCategory: 'Automotive',
      categories: ['automotive', 'repair'],
      enabled: true,
      keywords: ['car', 'engine', 'brake', 'repair', 'fix', 'vehicle', 'automotive'],
      tags: ['automotive', 'repair'],
      description: 'Complete guide for car engine maintenance and repair',
    },
    {
      id: 'zim-medicine',
      zimName: 'medical_handbook_en_2026',
      name: 'Medical Health Handbook',
      title: 'Clinical Diagnosis and Fever Treatment',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 7,
      category: 'medicine',
      parentCategory: 'Medicine',
      categories: ['medicine'],
      enabled: true,
      keywords: ['fever', 'disease', 'symptom', 'medicine', 'treatment', 'infection', 'health'],
      tags: ['medicine', 'health'],
      description: 'Medical reference for symptoms and disease treatment',
    },
    {
      id: 'zim-cooking',
      zimName: 'cooking_recipes_en_2026',
      name: 'Indian & World Recipes',
      title: 'How to Cook Paneer and Indian Dishes',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 7,
      category: 'cooking',
      parentCategory: 'Cooking',
      categories: ['cooking', 'guides', 'india'],
      enabled: true,
      keywords: ['recipe', 'cook', 'cooking', 'paneer', 'food', 'dish', 'ingredient', 'bake'],
      tags: ['cooking', 'food'],
      description: 'Step by step cooking recipes and food guides',
    },
    {
      id: 'zim-javascript',
      zimName: 'devdocs_en_javascript_2026',
      name: 'JavaScript DevDocs',
      title: 'JavaScript Reference & Array Map Method',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 8,
      category: 'programming',
      parentCategory: 'Programming',
      categories: ['programming'],
      enabled: true,
      keywords: ['javascript', 'array', 'map', 'code', 'programming', 'function'],
      tags: ['javascript', 'programming'],
      description: 'DevDocs documentation for JavaScript language',
    },
    {
      id: 'zim-ifixit',
      zimName: 'ifixit_en_all_2025-12',
      name: 'iFixit in English',
      title: 'iFixit Repair Manuals',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 9,
      category: 'repair',
      parentCategory: 'Repair',
      categories: ['repair', 'guides'],
      enabled: true,
      keywords: ['repair', 'fix', 'replace', 'battery', 'screen', 'ifixit', 'tool'],
      tags: ['repair', 'ifixit'],
      description: 'Fixit manuals mentioning occasional Indian tools or general items',
    },
  ];

  // 1. "indian history" -> India / History ZIMs outrank iFixit / wikiHow
  console.log('1. Testing Query: "indian history"...');
  const resIndia = relevance.selectRelevantSources('indian history', mockDiscovered, 5);
  const topIndia = resIndia.selectedSources[0];
  console.log(`   Top Source: ${topIndia.name} (Effective Priority: ${resIndia.scoredRanks[0].effectivePriority})`);
  console.log(`   Ranked Order: ${resIndia.scoredRanks.map(r => `${r.source.name} (${r.effectivePriority})`).join(' > ')}`);

  if (!topIndia.zimName.includes('indian_history')) {
    console.error(`❌ Test 1 Failed! Expected Indian History Collection, got ${topIndia.name}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: "indian history" correctly prioritized India & History collection.\n');

  // 2. "create folder in arch" -> Arch Wiki outranks other ZIMs
  console.log('2. Testing Query: "create folder in arch"...');
  const resArch = relevance.selectRelevantSources('create folder in arch', mockDiscovered, 5);
  const topArch = resArch.selectedSources[0];
  console.log(`   Top Source: ${topArch.name} (Effective Priority: ${resArch.scoredRanks[0].effectivePriority})`);

  if (topArch.name !== 'Arch Wiki') {
    console.error(`❌ Test 2 Failed! Expected Arch Wiki, got ${topArch.name}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: "create folder in arch" correctly prioritized Arch Wiki.\n');

  // 3. "car engine repair" -> Automotive Repair outranks iFixit & JavaScript
  console.log('3. Testing Query: "car engine repair"...');
  const resCar = relevance.selectRelevantSources('car engine repair', mockDiscovered, 5);
  const topCar = resCar.selectedSources[0];
  console.log(`   Top Source: ${topCar.name} (Effective Priority: ${resCar.scoredRanks[0].effectivePriority})`);

  if (topCar.name !== 'Automotive Engine Repair') {
    console.error(`❌ Test 3 Failed! Expected Automotive Engine Repair, got ${topCar.name}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: "car engine repair" correctly prioritized Automotive Repair.\n');

  // 4. "fever treatment" -> Medical Health Handbook outranks others
  console.log('4. Testing Query: "fever treatment"...');
  const resFever = relevance.selectRelevantSources('fever treatment', mockDiscovered, 5);
  const topFever = resFever.selectedSources[0];
  console.log(`   Top Source: ${topFever.name} (Effective Priority: ${resFever.scoredRanks[0].effectivePriority})`);

  if (topFever.name !== 'Medical Health Handbook') {
    console.error(`❌ Test 4 Failed! Expected Medical Health Handbook, got ${topFever.name}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: "fever treatment" correctly prioritized Medical Handbook.\n');

  // 5. "how to cook paneer" -> Indian & World Recipes outranks others
  console.log('5. Testing Query: "how to cook paneer"...');
  const resCook = relevance.selectRelevantSources('how to cook paneer', mockDiscovered, 5);
  const topCook = resCook.selectedSources[0];
  console.log(`   Top Source: ${topCook.name} (Effective Priority: ${resCook.scoredRanks[0].effectivePriority})`);

  if (topCook.name !== 'Indian & World Recipes') {
    console.error(`❌ Test 5 Failed! Expected Indian & World Recipes, got ${topCook.name}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: "how to cook paneer" correctly prioritized Cooking Recipes.\n');

  // 6. "javascript array map" -> JavaScript DevDocs outranks others
  console.log('6. Testing Query: "javascript array map"...');
  const resJs = relevance.selectRelevantSources('javascript array map', mockDiscovered, 5);
  const topJs = resJs.selectedSources[0];
  console.log(`   Top Source: ${topJs.name} (Effective Priority: ${resJs.scoredRanks[0].effectivePriority})`);

  if (topJs.name !== 'JavaScript DevDocs') {
    console.error(`❌ Test 6 Failed! Expected JavaScript DevDocs, got ${topJs.name}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: "javascript array map" correctly prioritized JavaScript DevDocs.\n');

  // 7. Unknown query -> falls back to basePriority ordering
  console.log('7. Testing Unknown Query Intent Fallback to basePriority...');
  const resUnknown = relevance.selectRelevantSources('xyz123abc456', mockDiscovered, 5);
  const topUnknown = resUnknown.selectedSources[0];
  console.log(`   Top Source (Fallback Base Priority): ${topUnknown.name} (basePriority: ${topUnknown.basePriority})`);

  if (topUnknown.name !== 'iFixit in English' && topUnknown.basePriority !== 9) {
    console.error(`❌ Test 7 Fallback Failed! Expected iFixit (basePriority 9), got ${topUnknown.name}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: Unknown query intent fell back gracefully to basePriority ordering.\n');

  console.log('====================================================');
  console.log(' ✅ ALL QUERY ROUTING & WEIGHTING TESTS PASSED!');
  console.log('====================================================');
}

runQueryRoutingTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
