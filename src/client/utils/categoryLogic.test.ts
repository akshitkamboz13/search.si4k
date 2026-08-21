import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCategoriesFromQuery,
  attachCategoryToQuery,
  removeCategoryFromQuery,
  extractAvailableCategories,
  filterZimsByCategory,
} from './categoryLogic.js';
import { ZimInfo } from '../../shared/types.js';

describe('categoryLogic utility tests (# category logic module)', () => {
  it('correctly extracts #category tags from query string', () => {
    const raw = 'how to build a website #programming #guides';
    const result = parseCategoriesFromQuery(raw);

    assert.equal(result.cleanQuery, 'how to build a website');
    assert.deepEqual(result.categories, ['programming', 'guides']);
  });

  it('handles query with no #category tags', () => {
    const raw = 'plain search query';
    const result = parseCategoriesFromQuery(raw);

    assert.equal(result.cleanQuery, 'plain search query');
    assert.deepEqual(result.categories, []);
  });

  it('attaches new category tag to query', () => {
    const original = 'python tutorial';
    const updated = attachCategoryToQuery(original, 'tech');

    assert.equal(updated, 'python tutorial #tech');
  });

  it('does not duplicate existing category tag', () => {
    const original = 'python tutorial #tech';
    const updated = attachCategoryToQuery(original, 'tech');

    assert.equal(updated, 'python tutorial #tech');
  });

  it('removes category tag from query', () => {
    const original = 'python tutorial #tech #programming';
    const updated = removeCategoryFromQuery(original, 'tech');

    assert.equal(updated, 'python tutorial #programming');
  });

  it('extracts unique sorted categories from ZIM sources', () => {
    const mockZims: ZimInfo[] = [
      { id: '1', zimName: 'z1', name: 'Z1', category: 'Encyclopedia', categories: ['Encyclopedia', 'General'], lang: 'en', basePriority: 10 },
      { id: '2', zimName: 'z2', name: 'Z2', category: 'Programming', categories: ['Programming', 'Tech'], lang: 'en', basePriority: 10 },
      { id: '3', zimName: 'z3', name: 'Z3', category: 'Encyclopedia', categories: ['Encyclopedia'], lang: 'en', basePriority: 10 },
    ];

    const categories = extractAvailableCategories(mockZims);
    assert.deepEqual(categories, ['encyclopedia', 'general', 'programming', 'tech']);
  });

  it('filters ZIM sources by selected categories', () => {
    const mockZims: ZimInfo[] = [
      { id: '1', zimName: 'z1', name: 'Z1', category: 'encyclopedia', lang: 'en', basePriority: 10 },
      { id: '2', zimName: 'z2', name: 'Z2', category: 'programming', lang: 'en', basePriority: 10 },
    ];

    const filtered = filterZimsByCategory(mockZims, ['programming']);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].zimName, 'z2');
  });
});
