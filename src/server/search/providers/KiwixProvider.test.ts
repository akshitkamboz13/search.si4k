import { KiwixProvider } from './KiwixProvider.js';
import { SearchSourceConfig } from '../../../shared/types.js';

async function runTests() {
  console.log('====================================================');
  console.log(' Running KiwixProvider Mode URL Separation Tests');
  console.log('====================================================\n');

  const testSource: SearchSourceConfig = {
    id: 'wikihow_en_2023_03',
    zimName: 'wikihow_en_maxi_2023-03',
    name: 'wikiHow',
    provider: 'kiwix',
    lang: 'en',
    basePriority: 9,
    category: 'guides',
    enabled: true,
    keywords: ['how to'],
  };

  const provider = new KiwixProvider({
    localUrl: 'http://192.168.31.250:8080',
    localPublicUrl: 'http://si4k-server.local:8080',
    onlineUrl: 'http://192.168.31.250:8080',
    onlinePublicUrl: 'https://wiki.si4k.online',
    sources: [testSource],
  });

  // 1. Test URL resolution for mode=local
  console.log('1. Testing URL Resolution for mode=local...');
  const localUrls = provider.getUrlsForMode('local');
  console.log(`   Internal Backend URL: ${localUrls.internalUrl}`);
  console.log(`   Public Browser URL:  ${localUrls.publicUrl}`);

  if (localUrls.internalUrl !== 'http://192.168.31.250:8080' || localUrls.publicUrl !== 'http://si4k-server.local:8080') {
    console.error('❌ Local mode URL resolution test failed!');
    process.exit(1);
  }

  const mockHtml = `
    <div class="results">
      <ul>
        <li>
          <a href="/content/wikihow_en_maxi_2023-03/Repair-Wall">How to Repair a Hole in a Wall</a>
          <cite>Drywall repair guide...</cite>
        </li>
      </ul>
    </div>
  `;

  const localResults = provider.parseKiwixHtml(mockHtml, testSource, localUrls.publicUrl);
  console.log(`   Local Result Target URL: ${localResults[0].url}`);

  if (!localResults[0].url.startsWith('http://si4k-server.local:8080/content/wikihow_en_maxi_2023-03/Repair-Wall')) {
    console.error(`❌ Local public result URL test failed! URL: ${localResults[0].url}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: mode=local correctly uses LOCAL_PUBLIC_URL.\n');

  // 2. Test URL resolution for mode=online
  console.log('2. Testing URL Resolution for mode=online...');
  const onlineUrls = provider.getUrlsForMode('online');
  console.log(`   Internal Backend URL: ${onlineUrls.internalUrl}`);
  console.log(`   Public Browser URL:  ${onlineUrls.publicUrl}`);

  if (onlineUrls.internalUrl !== 'http://192.168.31.250:8080' || onlineUrls.publicUrl !== 'https://wiki.si4k.online') {
    console.error('❌ Online mode URL resolution test failed!');
    process.exit(1);
  }

  const onlineResults = provider.parseKiwixHtml(mockHtml, testSource, onlineUrls.publicUrl);
  console.log(`   Online Result Target URL: ${onlineResults[0].url}`);

  if (!onlineResults[0].url.startsWith('https://wiki.si4k.online/content/wikihow_en_maxi_2023-03/Repair-Wall')) {
    console.error(`❌ Online public result URL test failed! URL: ${onlineResults[0].url}`);
    process.exit(1);
  }
  console.log('   ✅ PASS: mode=online correctly uses ONLINE_PUBLIC_URL.\n');

  console.log('====================================================');
  console.log(' ✅ ALL KIWIX PROVIDER MODE URL TESTS PASSED!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
