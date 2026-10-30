import { Component, computed, inject } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EXPENSE_CATEGORIES, Expense, ExpenseCategory } from '../expense.model';
import { EXPENSES_API, ExpenseService } from '../expense.service';
import { ExpenseSort, SORT_OPTIONS, filterAndSort, toQueryParams } from '../expense-filters';
import { ExpenseFilterStore } from '../expense-filter.store';

@Component({
  selector: 'app-expense-list',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './expense-list.component.html',
  styleUrl: './expense-list.component.scss'
})
export class ExpenseListComponent {
  private readonly expenseService = inject(ExpenseService);
  private readonly filters = inject(ExpenseFilterStore);

  readonly categories = EXPENSE_CATEGORIES;
  readonly sortOptions = SORT_OPTIONS;

  readonly expenses = this.expenseService.expenses;
  readonly loaded = this.expenseService.loaded;
  readonly loadFailed = this.expenseService.loadFailed;
  readonly criteria = this.filters.criteria;
  readonly filtersActive = this.filters.active;

  readonly visible = computed(() => filterAndSort(this.expenses(), this.criteria()));
  readonly visibleTotal = computed(() => this.visible().reduce((sum, e) => sum + e.amount, 0));

  /** Export links get the same filters and sort as the list, so the file matches what is shown. */
  private readonly exportQuery = computed(() => {
    const query = new URLSearchParams(toQueryParams(this.criteria())).toString();
    return query ? `?${query}` : '';
  });
  readonly csvUrl = computed(() => `${EXPENSES_API}/export.csv${this.exportQuery()}`);
  readonly xlsxUrl = computed(() => `${EXPENSES_API}/export.xlsx${this.exportQuery()}`);

  setSearch(search: string): void {
    this.filters.update({ search });
  }

  setCategory(category: string): void {
    this.filters.update({ category: category === 'all' ? 'all' : (category as ExpenseCategory) });
  }

  setFrom(from: string): void {
    this.filters.update({ from });
  }

  setTo(to: string): void {
    this.filters.update({ to });
  }

  setSort(sort: string): void {
    this.filters.update({ sort: sort as ExpenseSort });
  }

  clearRange(): void {
    this.filters.update({ from: '', to: '' });
  }

  clearFilters(): void {
    this.filters.clear();
  }

  retry(): Promise<void> {
    return this.expenseService.reload();
  }

  async delete(expense: Expense): Promise<void> {
    if (confirm(`Delete "${expense.title}"?`)) {
      await this.expenseService.remove(expense.id);
    }
  }
}
