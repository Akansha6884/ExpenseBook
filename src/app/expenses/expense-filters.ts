// Pure filtering/sorting, shared by the list page and the API's export endpoints.
// Keep this file free of Angular imports so api/ can use it.
import { EXPENSE_CATEGORIES, Expense, ExpenseCategory } from './expense.model';

export type ExpenseSort = 'added' | 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

export const SORT_OPTIONS: readonly { value: ExpenseSort; label: string }[] = [
  { value: 'added', label: 'Recently added' },
  { value: 'date-desc', label: 'Date: newest first' },
  { value: 'date-asc', label: 'Date: oldest first' },
  { value: 'amount-desc', label: 'Amount: high to low' },
  { value: 'amount-asc', label: 'Amount: low to high' }
];

export interface ExpenseFilterCriteria {
  /** Case-insensitive match against the title; blank matches everything. */
  search: string;
  category: ExpenseCategory | 'all';
  /** Inclusive YYYY-MM-DD bounds; '' means unbounded. */
  from: string;
  to: string;
  sort: ExpenseSort;
}

export const DEFAULT_FILTERS: ExpenseFilterCriteria = { search: '', category: 'all', from: '', to: '', sort: 'added' };

/** True if any criterion narrows the list (sorting alone doesn't count). */
export function hasActiveFilters(c: ExpenseFilterCriteria): boolean {
  return c.search.trim() !== '' || c.category !== 'all' || c.from !== '' || c.to !== '';
}

/**
 * Filters and sorts without mutating the input. 'added' keeps the API order
 * (newest added first); ties in the other sorts keep that order too.
 */
export function filterAndSort(expenses: readonly Expense[], c: ExpenseFilterCriteria): Expense[] {
  const search = c.search.trim().toLowerCase();
  const filtered = expenses.filter(
    (e) =>
      (search === '' || e.title.toLowerCase().includes(search)) &&
      (c.category === 'all' || e.category === c.category) &&
      (c.from === '' || e.date >= c.from) &&
      (c.to === '' || e.date <= c.to)
  );

  switch (c.sort) {
    case 'date-desc':
      return filtered.sort((a, b) => b.date.localeCompare(a.date));
    case 'date-asc':
      return filtered.sort((a, b) => a.date.localeCompare(b.date));
    case 'amount-desc':
      return filtered.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':
      return filtered.sort((a, b) => a.amount - b.amount);
    case 'added':
      return filtered;
  }
}

/** Query string for the export links; omits defaults to keep URLs short. */
export function toQueryParams(c: ExpenseFilterCriteria): Record<string, string> {
  const params: Record<string, string> = {};
  for (const key of ['search', 'category', 'from', 'to', 'sort'] as const) {
    const value = key === 'search' ? c.search.trim() : c[key];
    if (value !== DEFAULT_FILTERS[key]) {
      params[key] = value;
    }
  }
  return params;
}

/** Reads criteria from untrusted query params; anything invalid falls back to the default. */
export function parseFilterCriteria(query: Record<string, unknown>): ExpenseFilterCriteria {
  const text = (key: string): string => {
    const value = query[key];
    return typeof value === 'string' ? value : '';
  };
  const isDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);
  const category = text('category');
  const sort = text('sort');

  return {
    search: text('search').slice(0, 100),
    category: (EXPENSE_CATEGORIES as readonly string[]).includes(category) ? (category as ExpenseCategory) : 'all',
    from: isDate(text('from')) ? text('from') : '',
    to: isDate(text('to')) ? text('to') : '',
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? (sort as ExpenseSort) : 'added'
  };
}
