import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DEFAULT_FILTERS, ExpenseFilterCriteria, hasActiveFilters } from './expense-filters';

/** Keeps the list's filters while the user goes to Add/Edit and back, until the account changes. */
@Injectable({ providedIn: 'root' })
export class ExpenseFilterStore {
  private readonly criteriaSignal = signal<ExpenseFilterCriteria>(DEFAULT_FILTERS);

  readonly criteria = this.criteriaSignal.asReadonly();
  readonly active = computed(() => hasActiveFilters(this.criteriaSignal()));

  constructor() {
    const auth = inject(AuthService);
    // The next person to sign in on this tab starts with a clean list.
    effect(
      () => {
        auth.user();
        untracked(() => this.reset());
      },
      { allowSignalWrites: true }
    );
  }

  update(changes: Partial<ExpenseFilterCriteria>): void {
    this.criteriaSignal.update((c) => ({ ...c, ...changes }));
  }

  /** Clears the filters but keeps the chosen sort order. */
  clear(): void {
    this.criteriaSignal.update((c) => ({ ...DEFAULT_FILTERS, sort: c.sort }));
  }

  /** Back to defaults, including the sort order. */
  reset(): void {
    this.criteriaSignal.set(DEFAULT_FILTERS);
  }
}
