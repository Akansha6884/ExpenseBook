export type ExpenseCategory = 'Food' | 'Travel' | 'Shopping' | 'Bills' | 'Other';

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = ['Food', 'Travel', 'Shopping', 'Bills', 'Other'];

/** Shared limits, enforced by both ExpenseFormComponent and the API's parseNewExpense. */
export const TITLE_MAX_LENGTH = 60;
export const AMOUNT_MIN = 0.01;
export const AMOUNT_MAX = 1_000_000_000;

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  date: string; // YYYY-MM-DD
}

export type NewExpense = Omit<Expense, 'id'>;

/** True if `value` has at most two decimal places (whole paise). */
export function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}
