import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, firstValueFrom, map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { describeError, isUnauthorized } from '../http-errors';
import { Expense, NewExpense } from './expense.model';

export const EXPENSES_API = '/api/expenses';

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly expensesSignal = signal<Expense[]>([]);
  private readonly loadedSignal = signal(false);
  private readonly loadFailedSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  /** The signed-in user's expenses (empty while signed out). */
  readonly expenses = this.expensesSignal.asReadonly();
  /** True once the signed-in user's first fetch has finished (never true during SSR). */
  readonly loaded = this.loadedSignal.asReadonly();
  /** True if the most recent fetch failed, so `expenses` may not reflect what is saved. */
  readonly loadFailed = this.loadFailedSignal.asReadonly();
  /** Message for the last failed request; cleared by the next successful one or `clearError()`. */
  readonly error = this.errorSignal.asReadonly();
  readonly total = computed(() => this.expensesSignal().reduce((sum, e) => sum + e.amount, 0));

  constructor() {
    // Load the book whenever someone signs in, and drop it when they sign out. The user is
    // only known in the browser, so SSR never calls the API and renders "Loading…".
    effect(
      () => {
        const user = this.auth.user();
        untracked(() => {
          this.clear();
          if (user) {
            void this.reload();
          }
        });
      },
      { allowSignalWrites: true }
    );
  }

  async reload(): Promise<void> {
    const user = this.auth.user();
    const expenses = await this.send(this.http.get<Expense[]>(EXPENSES_API), "Couldn't load expenses.");
    if (this.auth.user() !== user) {
      return; // signed out or switched account while this was loading
    }
    if (expenses) {
      this.expensesSignal.set(expenses);
    }
    this.loadFailedSignal.set(!expenses);
    this.loadedSignal.set(true);
  }

  /** Resolves to false if the request failed (see `error`). */
  async add(expense: NewExpense): Promise<boolean> {
    const created = await this.send(this.http.post<Expense>(EXPENSES_API, expense), "Couldn't add the expense.");
    if (!created) {
      return false;
    }
    this.expensesSignal.update((list) => [created, ...list]);
    return true;
  }

  /** Resolves to false if the request failed (see `error`). */
  async edit(id: string, changes: NewExpense): Promise<boolean> {
    const updated = await this.send(
      this.http.put<Expense>(`${EXPENSES_API}/${id}`, changes),
      "Couldn't save the expense."
    );
    if (!updated) {
      return false;
    }
    this.expensesSignal.update((list) => list.map((e) => (e.id === id ? updated : e)));
    return true;
  }

  /** Resolves to false if the request failed (see `error`). */
  async remove(id: string): Promise<boolean> {
    const deleted = await this.send(
      this.http.delete(`${EXPENSES_API}/${id}`).pipe(map(() => true)),
      "Couldn't delete the expense."
    );
    if (!deleted) {
      return false;
    }
    this.expensesSignal.update((list) => list.filter((e) => e.id !== id));
    return true;
  }

  clearError(): void {
    this.errorSignal.set(null);
  }

  private clear(): void {
    this.expensesSignal.set([]);
    this.loadedSignal.set(false);
    this.loadFailedSignal.set(false);
    this.errorSignal.set(null);
  }

  private async send<T>(request: Observable<T>, failMessage: string): Promise<T | undefined> {
    try {
      const result = await firstValueFrom(request);
      this.errorSignal.set(null);
      return result;
    } catch (err: unknown) {
      // A 401 means the session expired; sessionInterceptor is already sending the user to sign in.
      if (!isUnauthorized(err)) {
        this.errorSignal.set(`${failMessage} ${describeError(err)}`);
      }
      return undefined;
    }
  }
}
