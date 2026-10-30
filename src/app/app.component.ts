import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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

  title = 'expense-book';
  readonly error = this.expenseService.error;
  readonly user = this.auth.user;

  dismissError(): void {
    this.expenseService.clearError();
  }

  signOut(): Promise<void> {
    return this.auth.logout();
  }
}
