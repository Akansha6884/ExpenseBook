import { EXPENSE_CATEGORIES, Expense, ExpenseCategory } from './expense.model';

export interface MonthTotal {
  /** YYYY-MM */
  month: string;
  total: number;
  count: number;
}

export interface CategoryTotal {
  category: ExpenseCategory;
  total: number;
  count: number;
  /** Share of the grand total, 0–100. */
  percent: number;
}

/** 'YYYY-MM' for a Date in local time. */
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Adds `delta` months to a 'YYYY-MM' key. */
export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const index = year * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * Totals for `count` consecutive months ending at `endMonth`, oldest first.
 * Months without expenses are included as zero so the time axis stays even.
 */
export function monthlyTotals(expenses: readonly Expense[], endMonth: string, count = 12): MonthTotal[] {
  const months = Array.from({ length: count }, (_, i) => shiftMonth(endMonth, i - (count - 1)));
  const byMonth = new Map(months.map((month): [string, MonthTotal] => [month, { month, total: 0, count: 0 }]));
  for (const e of expenses) {
    const bucket = byMonth.get(e.date.slice(0, 7));
    if (bucket) {
      bucket.total = roundToPaise(bucket.total + e.amount);
      bucket.count += 1;
    }
  }
  return months.map((month) => byMonth.get(month) as MonthTotal);
}

/** Totals per category that has expenses, largest first. */
export function categoryTotals(expenses: readonly Expense[]): CategoryTotal[] {
  const grand = expenses.reduce((sum, e) => sum + e.amount, 0);
  return EXPENSE_CATEGORIES.map((category) => {
    const items = expenses.filter((e) => e.category === category);
    const total = roundToPaise(items.reduce((sum, e) => sum + e.amount, 0));
    return { category, total, count: items.length, percent: grand > 0 ? (total / grand) * 100 : 0 };
  })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.total - a.total);
}

/** Avoids float drift such as 0.1 + 0.2 = 0.30000000000000004 in displayed sums. */
function roundToPaise(value: number): number {
  return Math.round(value * 100) / 100;
}
