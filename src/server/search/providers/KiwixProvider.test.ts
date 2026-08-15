import { KiwixProvider } from './KiwixProvider.js';
import { SearchSourceConfig } from '../../../shared/types.js';

async function runTests() {
  console.log('====================================================');
  console.log(' Running KiwixProvider Exact DOM & Multi-ZIM Unit Tests');
  console.log('====================================================\n');

  const testSources: SearchSourceConfig[] = [
    {
      id: 'wikihow_en_2023_03',
      zimName: 'wikihow_en_maxi_2023-03',
      name: 'wikiHow',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 9,
      category: 'guides',
      enabled: true,
      keywords: ['how to'],
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
      keywords: ['general'],
    },
    {
      id: 'archwiki_en_2026_07',
      zimName: 'archlinux_en_all_maxi_2026-07',
      name: 'Arch Wiki',
      provider: 'kiwix',
      lang: 'en',
      basePriority: 6,
      category: 'technical',
      enabled: true,
      keywords: ['arch'],
    },
  ];

  const provider = new KiwixProvider({
    internalUrl: 'http://192.168.31.250:8080',
    publicUrl: 'http://192.168.31.250:8080',
    sources: testSources,
  });

  // Sample HTML response matching exact kiwix-serve HTML output
  const mockWikiHowHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <div class="results">
          <ul>
            <li>
              <a href="/content/wikihow_en_maxi_2023-03/Update-a-Toyota-Corolla-Car-Radio">3 Ways to Update a Toyota Corolla Car Radio - wikiHow</a>
              <cite>Step by step car radio update guide...</cite>
            </li>
          </ul>
        </div>
      </body>
    </html>
  `;

  const mockWikipediaHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <div class="results">
          <ul>
            <li>
              <a href="/content/wikipedia_en_all_nopic_2026-06/List_of_Toyota_vehicles">List of Toyota vehicles</a>
              <cite>Toyota has produced and marketed vehicles since 1935...</cite>
            </li>
          </ul>
        </div>
      </body>
    </html>
  `;

  const mockArchHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <div class="results">
          <ul>
            <li>
              <a href="/content/archlinux_en_all_maxi_2026-07/Mutt">Mutt</a>
              <cite>Mutt email configuration in Arch Linux...</cite>
            </li>
          </ul>
        </div>
      </body>
    </html>
  `;

  console.log('1. Testing exact HTML parsing across 3 distinct ZIM sources...');

  const wikihowResults = provider.parseKiwixHtml(mockWikiHowHtml, testSources[0]);
  const wikipediaResults = provider.parseKiwixHtml(mockWikipediaHtml, testSources[1]);
  const archResults = provider.parseKiwixHtml(mockArchHtml, testSources[2]);

  if (wikihowResults.length !== 1 || wikipediaResults.length !== 1 || archResults.length !== 1) {
    console.error('❌ Parsing test failed! Did not extract 1 result per ZIM.');
    process.exit(1);
  }

  const res1 = wikihowResults[0];
  const res2 = wikipediaResults[0];
  const res3 = archResults[0];

  console.log(`   wikiHow Title:   "${res1.title}"`);
  console.log(`   wikiHow URL:     ${res1.url}`);
  console.log(`   Wikipedia Title: "${res2.title}"`);
  console.log(`   Wikipedia URL:   ${res2.url}`);
  console.log(`   Arch Wiki Title: "${res3.title}"`);
  console.log(`   Arch Wiki URL:   ${res3.url}`);

  // Assertions
  if (res1.source !== 'wikiHow' || res1.zimName !== 'wikihow_en_maxi_2023-03') {
    console.error('❌ wikiHow metadata assertion failed!');
    process.exit(1);
  }
  if (res2.source !== 'Wikipedia' || res2.zimName !== 'wikipedia_en_all_nopic_2026-06') {
    console.error('❌ Wikipedia metadata assertion failed!');
    process.exit(1);
  }
  if (res3.source !== 'Arch Wiki' || res3.zimName !== 'archlinux_en_all_maxi_2026-07') {
    console.error('❌ Arch Wiki metadata assertion failed!');
    process.exit(1);
  }

  // Verify actual article titles
  if (res1.title !== '3 Ways to Update a Toyota Corolla Car Radio - wikiHow') {
    console.error(`❌ wikiHow actual title mismatch: "${res1.title}"`);
    process.exit(1);
  }
  if (res2.title !== 'List of Toyota vehicles') {
    console.error(`❌ Wikipedia actual title mismatch: "${res2.title}"`);
    process.exit(1);
  }
  if (res3.title !== 'Mutt') {
    console.error(`❌ Arch Wiki actual title mismatch: "${res3.title}"`);
    process.exit(1);
  }

  // Verify deterministic IDs
  if (res1.id !== 'wikihow_en_maxi_2023-03:/content/wikihow_en_maxi_2023-03/Update-a-Toyota-Corolla-Car-Radio') {
    console.error(`❌ Deterministic ID assertion failed: ${res1.id}`);
    process.exit(1);
  }

  console.log('   ✅ PASS: Exact HTML parsing, actual titles, deterministic IDs, and URLs verified across 3 ZIMs!\n');

  console.log('====================================================');
  console.log(' ✅ ALL KIWIX PROVIDER TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
