import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { settle, signIn } from '../testing/sign-in';
import { Expense } from './expense.model';
import {
  DEFAULT_FILTERS,
  ExpenseFilterCriteria,
  filterAndSort,
  hasActiveFilters,
  parseFilterCriteria,
  toQueryParams
} from './expense-filters';
import { ExpenseFilterStore } from './expense-filter.store';

// API order: newest added first.
const expenses: Expense[] = [
  { id: 'd', title: 'Movie tickets', amount: 500, category: 'Other', date: '2026-10-20' },
  { id: 'c', title: 'Electricity bill', amount: 1800, category: 'Bills', date: '2026-09-15' },
  { id: 'b', title: 'Train to Pune', amount: 300, category: 'Travel', date: '2026-10-05' },
  { id: 'a', title: 'Groceries', amount: 1200.5, category: 'Food', date: '2026-08-30' }
];

function ids(c: Partial<ExpenseFilterCriteria>): string[] {
  return filterAndSort(expenses, { ...DEFAULT_FILTERS, ...c }).map((e) => e.id);
}

describe('filterAndSort', () => {
  it('returns everything in API order with the default criteria', () => {
    expect(ids({})).toEqual(['d', 'c', 'b', 'a']);
  });

  it('searches titles case-insensitively and ignores surrounding spaces', () => {
    expect(ids({ search: '  TRAIN ' })).toEqual(['b']);
    expect(ids({ search: 'i' })).toEqual(['d', 'c', 'b', 'a']);
    expect(ids({ search: 'zzz' })).toEqual([]);
  });

  it('filters by category', () => {
    expect(ids({ category: 'Bills' })).toEqual(['c']);
  });

  it('filters by an inclusive date range', () => {
    expect(ids({ from: '2026-09-15', to: '2026-10-05' })).toEqual(['c', 'b']);
    expect(ids({ from: '2026-10-01' })).toEqual(['d', 'b']);
    expect(ids({ to: '2026-08-30' })).toEqual(['a']);
  });

  it('combines filters', () => {
    expect(ids({ search: 'e', from: '2026-09-01', category: 'Bills' })).toEqual(['c']);
  });

  it('sorts by date and by amount', () => {
    expect(ids({ sort: 'date-desc' })).toEqual(['d', 'b', 'c', 'a']);
    expect(ids({ sort: 'date-asc' })).toEqual(['a', 'c', 'b', 'd']);
    expect(ids({ sort: 'amount-desc' })).toEqual(['c', 'a', 'd', 'b']);
    expect(ids({ sort: 'amount-asc' })).toEqual(['b', 'd', 'a', 'c']);
  });

  it('keeps added order for ties', () => {
    const tied: Expense[] = [
      { ...expenses[0], id: 'x', amount: 100 },
      { ...expenses[1], id: 'y', amount: 100 }
    ];
    expect(filterAndSort(tied, { ...DEFAULT_FILTERS, sort: 'amount-desc' }).map((e) => e.id)).toEqual(['x', 'y']);
  });

  it('does not mutate the input array', () => {
    const copy = [...expenses];
    filterAndSort(expenses, { ...DEFAULT_FILTERS, sort: 'amount-asc' });
    expect(expenses).toEqual(copy);
  });
});

describe('hasActiveFilters', () => {
  it('ignores the sort order and blank search', () => {
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: 'amount-desc', search: '   ' })).toBeFalse();
  });

  it('is true for any narrowing criterion', () => {
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, search: 'x' })).toBeTrue();
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, category: 'Food' })).toBeTrue();
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, from: '2026-01-01' })).toBeTrue();
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, to: '2026-01-01' })).toBeTrue();
  });
});

describe('toQueryParams / parseFilterCriteria', () => {
  it('leaves out defaults, so an unfiltered export has no query', () => {
    expect(toQueryParams(DEFAULT_FILTERS)).toEqual({});
    expect(toQueryParams({ ...DEFAULT_FILTERS, search: '  ' })).toEqual({});
  });

  it('round-trips every criterion', () => {
    const criteria: ExpenseFilterCriteria = {
      search: 'tea',
      category: 'Food',
      from: '2026-01-01',
      to: '2026-01-31',
      sort: 'amount-asc'
    };
    expect(parseFilterCriteria(toQueryParams(criteria))).toEqual(criteria);
  });

  it('falls back to defaults for anything invalid', () => {
    const parsed = parseFilterCriteria({ category: 'Yachts', from: 'yesterday', to: ['2026-01-01'], sort: 'random', search: 7 });
    expect(parsed).toEqual(DEFAULT_FILTERS);
  });
});

describe('ExpenseFilterStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    });
  });

  it('updates criteria and clears filters while keeping the sort', () => {
    const store = TestBed.inject(ExpenseFilterStore);

    store.update({ search: 'tea', category: 'Food', sort: 'amount-asc' });
    expect(store.active()).toBeTrue();

    store.clear();
    expect(store.criteria()).toEqual({ ...DEFAULT_FILTERS, sort: 'amount-asc' });
    expect(store.active()).toBeFalse();
  });

  it('starts over when someone signs in', async () => {
    const store = TestBed.inject(ExpenseFilterStore);
    await settle();
    store.update({ search: 'tea', sort: 'amount-asc' });

    await signIn(TestBed.inject(HttpTestingController));

    expect(store.criteria()).toEqual(DEFAULT_FILTERS);
  });
});
