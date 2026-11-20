import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EXPENSE_CATEGORIES, ExpenseCategory } from '../expense.model';
import { ExpenseService } from '../expense.service';
import { categoryTotals, monthKeyOf, monthlyTotals, shiftMonth } from '../expense-stats';

@Component({
  selector: 'app-summary',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, DecimalPipe, RouterLink],
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.scss'
})
export class SummaryComponent {
  private readonly expenseService = inject(ExpenseService);

  readonly expenses = this.expenseService.expenses;
  readonly loaded = this.expenseService.loaded;
  readonly loadFailed = this.expenseService.loadFailed;
  readonly total = this.expenseService.total;
  readonly categoryOptions = EXPENSE_CATEGORIES;

  /** What the user picked: 'all' or a 'YYYY-MM' key. Read it through `selectedMonth`. */
  private readonly selection = signal('all');
  readonly selectedCategory = signal<'all' | ExpenseCategory>('all');

  /** This month, or the latest expense's month if later. */
  readonly latestMonth = computed(() =>
    this.expenses().reduce((max, e) => (e.date.slice(0, 7) > max ? e.date.slice(0, 7) : max), monthKeyOf(new Date()))
  );

  /** Every month from the latest to the oldest expense's month, newest first, including empty ones. */
  readonly monthOptions = computed(() => {
    const expenses = this.expenses();
    if (expenses.length === 0) {
      return [];
    }
    const latest = this.latestMonth();
    const oldest = expenses.reduce((min, e) => (e.date.slice(0, 7) < min ? e.date.slice(0, 7) : min), latest);
    const options: string[] = [];
    for (let month = latest; month >= oldest; month = shiftMonth(month, -1)) {
      options.push(month);
    }
    return options;
  });

  /** The pick, or 'all' once that month has dropped out of the list. */
  readonly selectedMonth = computed(() => {
    const month = this.selection();
    return this.monthOptions().includes(month) ? month : 'all';
  });

  /** Month filter only: By category shows every category for the period. */
  readonly monthExpenses = computed(() => {
    const month = this.selectedMonth();
    const expenses = this.expenses();
    return month === 'all' ? expenses : expenses.filter((e) => e.date.slice(0, 7) === month);
  });

  /** Category filter only: the monthly chart keeps its window and shows that category. */
  readonly categoryExpenses = computed(() => {
    const category = this.selectedCategory();
    const expenses = this.expenses();
    return category === 'all' ? expenses : expenses.filter((e) => e.category === category);
  });

  readonly selectedExpenses = computed(() => {
    const category = this.selectedCategory();
    const expenses = this.monthExpenses();
    return category === 'all' ? expenses : expenses.filter((e) => e.category === category);
  });

  /** The selected month's total and count; null for All time. */
  readonly selectedStats = computed(() => {
    const month = this.selectedMonth();
    return month === 'all' ? null : monthlyTotals(this.categoryExpenses(), month, 1)[0];
  });
  readonly noData = computed(() => this.selectedExpenses().length === 0);

  /** The latest month, unless the selected month is older than the 12 months ending there. */
  readonly chartEnd = computed(() => {
    const month = this.selectedMonth();
    const latest = this.latestMonth();
    return month !== 'all' && month < shiftMonth(latest, -11) ? month : latest;
  });
  readonly months = computed(() => monthlyTotals(this.categoryExpenses(), this.chartEnd()));
  readonly monthMax = computed(() => Math.max(...this.months().map((m) => m.total)));
  readonly thisMonth = computed(() => this.months().find((m) => m.month === monthKeyOf(new Date()))?.total ?? 0);

  readonly categories = computed(() => categoryTotals(this.monthExpenses()));
  readonly categoryMax = computed(() => this.categories()[0]?.total ?? 0);
  readonly topCategory = computed(() => this.categories()[0]?.category ?? '—');
  /** The selected category's rounded total and share for the period; undefined without one or without data. */
  readonly categoryStats = computed(() => this.categories().find((c) => c.category === this.selectedCategory()));

  setMonth(month: string): void {
    this.selection.set(month);
  }

  setCategory(value: string): void {
    this.selectedCategory.set(EXPENSE_CATEGORIES.find((c) => c === value) ?? 'all');
  }

  /** Bar length as a percentage of the largest bar. */
  share(value: number, max: number): number {
    return max > 0 ? (value / max) * 100 : 0;
  }

  retry(): Promise<void> {
    return this.expenseService.reload();
  }
}
