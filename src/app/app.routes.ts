import { Routes } from '@angular/router';
import { AuthFormComponent } from './auth/auth-form/auth-form.component';
import { guestGuard, signedInGuard } from './auth/auth.guards';
import { ExpenseFormComponent } from './expenses/expense-form/expense-form.component';
import { ExpenseListComponent } from './expenses/expense-list/expense-list.component';
import { SummaryComponent } from './expenses/summary/summary.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'expenses' },
  { path: 'login', component: AuthFormComponent, canActivate: [guestGuard], data: { mode: 'login' }, title: 'Sign in · Expense Book' },
  {
    path: 'signup',
    component: AuthFormComponent,
    canActivate: [guestGuard],
    data: { mode: 'signup' },
    title: 'Create account · Expense Book'
  },
  { path: 'add', component: ExpenseFormComponent, canActivate: [signedInGuard], title: 'Add Expense · Expense Book' },
  { path: 'edit/:id', component: ExpenseFormComponent, canActivate: [signedInGuard], title: 'Edit Expense · Expense Book' },
  { path: 'expenses', component: ExpenseListComponent, canActivate: [signedInGuard], title: 'Expenses · Expense Book' },
  { path: 'summary', component: SummaryComponent, canActivate: [signedInGuard], title: 'Summary · Expense Book' },
  { path: '**', redirectTo: 'expenses' }
];
