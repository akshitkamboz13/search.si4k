import fs from 'fs';
import path from 'path';
import { ZimIndexer } from '../src/server/search/ZimIndexer.js';
import { config } from '../src/server/config.js';

async function main() {
  console.log(`====================================================`);
  console.log(` Starting Si4k ZIM Index Builder`);
  console.log(` Library XML Path: ${config.kiwix.libraryXml}`);
  console.log(`====================================================\n`);

  let xmlContent = '';

  if (fs.existsSync(config.kiwix.libraryXml)) {
    console.log(`Reading metadata from local file: ${config.kiwix.libraryXml}`);
    xmlContent = fs.readFileSync(config.kiwix.libraryXml, 'utf-8');
  } else {
    const catalogUrl = `${config.kiwix.localUrl}/catalog/v2/entries?count=1000`;
    const outputPath = path.join(process.cwd(), 'data', 'zim-index.json');
    console.log(`Local file absent. Attempting to fetch ZIM catalog feed from ${catalogUrl}...`);
    try {
      const res = await fetch(catalogUrl, {
        headers: { 'Accept': 'application/atom+xml, application/xml, */*' }
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      xmlContent = await res.text();
    } catch (err) {
      if (fs.existsSync(outputPath)) {
        console.warn(`\n⚠️  Could not fetch catalog feed from ${catalogUrl} (${err instanceof Error ? err.message : String(err)}).`);
        console.warn(`⚠️  Preserving existing prebuilt index at: ${outputPath}`);
        return;
      }
      console.error(`\n❌ Failed to fetch catalog feed from ${catalogUrl} and no existing ZIM index found:`, err);
      process.exit(1);
    }
  }

  const indexer = new ZimIndexer();
  const indexData = indexer.buildIndex(xmlContent);

  const outputPath = path.join(process.cwd(), 'data', 'zim-index.json');
  indexer.saveIndex(indexData);
  console.log(`\n✅ Prebuilt ZIM index successfully saved to: ${outputPath}`);
}

main().catch((err) => {
  console.error('Error building ZIM index:', err);
  process.exit(1);
});
