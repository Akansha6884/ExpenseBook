import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { ExpenseService } from './expenses/expense.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  private readonly expenseService = inject(ExpenseService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  title = 'expense-book';
  readonly error = this.expenseService.error;
  readonly user = this.auth.user;
  /** Editing an expense is part of the Expenses tab, though its URL is /edit/:id. */
  readonly onExpensesTab = computed(() => /^\/(expenses|edit\/)/.test(this.url()));

  dismissError(): void {
    this.expenseService.clearError();
  }

  signOut(): Promise<void> {
    return this.auth.logout();
  }
}
