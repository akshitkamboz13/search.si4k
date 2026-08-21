import { ZimInfo } from '../../shared/types.js';

export interface CategoryParseResult {
  cleanQuery: string;
  categories: string[];
}

/**
  Separate logic module for '#' category attachment & tag handling
 */

/**
 * Extracts attached #category tags from raw query string.
 * Example: "how to install node #programming #guides"
 * Returns: { cleanQuery: "how to install node", categories: ["programming", "guides"] }
 */
export function parseCategoriesFromQuery(rawQuery: string): CategoryParseResult {
  if (!rawQuery) {
    return { cleanQuery: '', categories: [] };
  }

  const categoryRegex = /#([a-zA-Z0-9_\-]+)/g;
  const categories: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = categoryRegex.exec(rawQuery)) !== null) {
    const cat = match[1].trim().toLowerCase();
    if (cat && !categories.includes(cat)) {
      categories.push(cat);
    }
  }

  const cleanQuery = rawQuery.replace(categoryRegex, '').replace(/\s+/g, ' ').trim();
  return { cleanQuery, categories };
}

/**
 * Attaches a category tag (#category) to the search query if not already present.
 */
export function attachCategoryToQuery(currentQuery: string, categoryName: string): string {
  const normalizedCat = categoryName.trim().toLowerCase().replace(/^#/, '');
  if (!normalizedCat) return currentQuery;

  const { cleanQuery, categories } = parseCategoriesFromQuery(currentQuery);
  if (!categories.includes(normalizedCat)) {
    categories.push(normalizedCat);
  }

  const tagString = categories.map(c => `#${c}`).join(' ');
  return cleanQuery ? `${cleanQuery} ${tagString}` : tagString;
}

/**
 * Removes a category tag (#category) from the search query.
 */
export function removeCategoryFromQuery(currentQuery: string, categoryName: string): string {
  const normalizedCat = categoryName.trim().toLowerCase().replace(/^#/, '');
  if (!normalizedCat) return currentQuery;

  const { cleanQuery, categories } = parseCategoriesFromQuery(currentQuery);
  const updatedCategories = categories.filter(c => c !== normalizedCat);

  if (updatedCategories.length === 0) {
    return cleanQuery;
  }

  const tagString = updatedCategories.map(c => `#${c}`).join(' ');
  return cleanQuery ? `${cleanQuery} ${tagString}` : tagString;
}

/**
 * Extracts a unique, sorted list of categories from available ZIM sources.
 */
export function extractAvailableCategories(zims: ZimInfo[]): string[] {
  const categorySet = new Set<string>();

  for (const zim of zims) {
    if (zim.category) {
      categorySet.add(zim.category.toLowerCase());
    }
    if (Array.isArray(zim.categories)) {
      for (const c of zim.categories) {
        if (c) categorySet.add(c.toLowerCase());
      }
    }
  }

  return Array.from(categorySet).sort();
}

/**
 * Filters ZIM sources based on active selected categories.
 */
export function filterZimsByCategory(zims: ZimInfo[], selectedCategories: string[]): ZimInfo[] {
  if (!selectedCategories || selectedCategories.length === 0) {
    return zims;
  }

  const targetCats = new Set(selectedCategories.map(c => c.toLowerCase()));

  return zims.filter(zim => {
    if (zim.category && targetCats.has(zim.category.toLowerCase())) {
      return true;
    }
    if (Array.isArray(zim.categories) && zim.categories.some(c => targetCats.has(c.toLowerCase()))) {
      return true;
    }
    return false;
  });
}
