import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
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

  /** What the user picked: 'all' or a 'YYYY-MM' key. Read it through `selectedMonth`. */
  private readonly selection = signal('all');

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

  readonly selectedExpenses = computed(() => {
    const month = this.selectedMonth();
    const expenses = this.expenses();
    return month === 'all' ? expenses : expenses.filter((e) => e.date.slice(0, 7) === month);
  });

  /** The selected month's total and count; null for All time. */
  readonly selectedStats = computed(() => {
    const month = this.selectedMonth();
    return month === 'all' ? null : monthlyTotals(this.expenses(), month, 1)[0];
  });
  readonly noData = computed(() => this.selectedStats()?.count === 0);

  /** The latest month, unless the selected month is older than the 12 months ending there. */
  readonly chartEnd = computed(() => {
    const month = this.selectedMonth();
    const latest = this.latestMonth();
    return month !== 'all' && month < shiftMonth(latest, -11) ? month : latest;
  });
  readonly months = computed(() => monthlyTotals(this.expenses(), this.chartEnd()));
  readonly monthMax = computed(() => Math.max(...this.months().map((m) => m.total)));
  readonly thisMonth = computed(() => this.months().find((m) => m.month === monthKeyOf(new Date()))?.total ?? 0);

  readonly categories = computed(() => categoryTotals(this.selectedExpenses()));
  readonly categoryMax = computed(() => this.categories()[0]?.total ?? 0);
  readonly topCategory = computed(() => this.categories()[0]?.category ?? '—');

  setMonth(month: string): void {
    this.selection.set(month);
  }

  /** Bar length as a percentage of the largest bar. */
  share(value: number, max: number): number {
    return max > 0 ? (value / max) * 100 : 0;
  }

  retry(): Promise<void> {
    return this.expenseService.reload();
  }
}
