export interface ZimParseResult {
  cleanQuery: string;
  zims: string[];
}

/**
 * Dedicated helper module for '@' ZIM tag parsing and query attachment.
 */

/**
 * Parses attached @zim tags from raw query string.
 * Example: "quantum computing @wikipedia_en_all @wikihow_en_all"
 * Returns: { cleanQuery: "quantum computing", zims: ["wikipedia_en_all", "wikihow_en_all"] }
 */
export function parseZimsFromQuery(rawQuery: string): ZimParseResult {
  if (!rawQuery) {
    return { cleanQuery: '', zims: [] };
  }

  const zimRegex = /@([a-zA-Z0-9_\-\.]+)/g;
  const zims: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = zimRegex.exec(rawQuery)) !== null) {
    const zim = match[1].trim();
    if (zim && !zims.includes(zim)) {
      zims.push(zim);
    }
  }

  const cleanQuery = rawQuery.replace(zimRegex, '').replace(/\s+/g, ' ').trim();
  return { cleanQuery, zims };
}

/**
 * Attaches a ZIM tag (@zimName) to the query string if not already present.
 */
export function attachZimToQuery(currentQuery: string, zimName: string): string {
  const normalizedZim = zimName.trim().replace(/^@/, '');
  if (!normalizedZim) return currentQuery;

  const { cleanQuery, zims } = parseZimsFromQuery(currentQuery);
  if (!zims.includes(normalizedZim)) {
    zims.push(normalizedZim);
  }

  const tagString = zims.map(z => `@${z}`).join(' ');
  return cleanQuery ? `${cleanQuery} ${tagString}` : tagString;
}

/**
 * Removes a ZIM tag (@zimName) from the query string.
 */
export function removeZimFromQuery(currentQuery: string, zimName: string): string {
  const normalizedZim = zimName.trim().replace(/^@/, '');
  if (!normalizedZim) return currentQuery;

  const { cleanQuery, zims } = parseZimsFromQuery(currentQuery);
  const updatedZims = zims.filter(z => z.toLowerCase() !== normalizedZim.toLowerCase());

  if (updatedZims.length === 0) {
    return cleanQuery;
  }

  const tagString = updatedZims.map(z => `@${z}`).join(' ');
  return cleanQuery ? `${cleanQuery} ${tagString}` : tagString;
}
