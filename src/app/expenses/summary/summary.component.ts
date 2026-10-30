import { Component, computed, inject } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ExpenseService } from '../expense.service';
import { categoryTotals, monthKeyOf, monthlyTotals } from '../expense-stats';

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

  /** Last 12 months, ending this month (or the latest expense's month, if later). */
  readonly months = computed(() => {
    const expenses = this.expenses();
    const current = monthKeyOf(new Date());
    const latest = expenses.reduce((max, e) => (e.date.slice(0, 7) > max ? e.date.slice(0, 7) : max), current);
    return monthlyTotals(expenses, latest);
  });
  readonly monthMax = computed(() => Math.max(...this.months().map((m) => m.total)));
  readonly thisMonth = computed(() => this.months().find((m) => m.month === monthKeyOf(new Date()))?.total ?? 0);

  readonly categories = computed(() => categoryTotals(this.expenses()));
  readonly categoryMax = computed(() => this.categories()[0]?.total ?? 0);

  /** Bar length as a percentage of the largest bar. */
  share(value: number, max: number): number {
    return max > 0 ? (value / max) * 100 : 0;
  }

  retry(): Promise<void> {
    return this.expenseService.reload();
  }
}
