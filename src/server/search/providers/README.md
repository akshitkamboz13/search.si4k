# Search Providers Architecture

Si4k Search uses a pluggable, provider-based search engine architecture. The `SearchEngine` core is source-agnostic and interacts exclusively with the `SearchProvider` interface.

## Provider Interface

All providers must implement the `SearchProvider` interface defined in `src/server/search/types.ts`:

```typescript
import { SearchResult, SearchOptions } from '../../../shared/types.js';

export interface SearchProvider {
  name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}
```

## Creating a New Provider (Example: OSMProvider)

To add a new provider (e.g., OpenStreetMap for location lookups):

1. Create `src/server/search/providers/OSMProvider.ts`:

```typescript
import { SearchProvider } from '../types.js';
import { SearchResult, SearchOptions } from '../../../shared/types.js';

export class OSMProvider implements SearchProvider {
  readonly name = 'osm';

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    // 1. Query local Nominatim/OSM server or database
    // 2. Map response to normalized SearchResult[]
    return [
      {
        id: `osm-1`,
        source: 'OpenStreetMap',
        provider: this.name,
        type: 'location',
        title: query,
        description: 'Location from offline OpenStreetMap dataset',
        url: `https://maps.si4k.online/?q=${encodeURIComponent(query)}`,
      }
    ];
  }
}
```

2. Register the provider in `src/server/index.ts`:

```typescript
import { OSMProvider } from './search/providers/OSMProvider.js';

const osmProvider = new OSMProvider();
searchEngine.registerProvider(osmProvider);
```

No changes to `SearchEngine` or API router logic are required when adding new providers.
