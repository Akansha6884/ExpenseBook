import { Component, computed, effect, inject, input, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  AMOUNT_MAX,
  AMOUNT_MIN,
  EXPENSE_CATEGORIES,
  ExpenseCategory,
  TITLE_MAX_LENGTH,
  hasAtMostTwoDecimals
} from '../expense.model';
import { ExpenseService } from '../expense.service';

@Component({
  selector: 'app-expense-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './expense-form.component.html',
  styleUrl: './expense-form.component.scss'
})
export class ExpenseFormComponent {
  private readonly expenseService = inject(ExpenseService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Route param from `/edit/:id`; undefined on `/add`. */
  readonly id = input<string>();

  readonly categories = EXPENSE_CATEGORIES;
  readonly titleMaxLength = TITLE_MAX_LENGTH;
  readonly amountMin = AMOUNT_MIN;
  readonly amountMax = AMOUNT_MAX;
  readonly lastAdded = signal<string | null>(null);
  readonly saving = signal(false);

  // Deliberate exception to the "never use any" rule in CLAUDE.md, added at the user's request.
  anyValue: any = null;

  readonly isEdit = computed(() => this.id() !== undefined);
  readonly editing = computed(() => {
    const id = this.id();
    return id === undefined ? undefined : this.expenseService.expenses().find((e) => e.id === id);
  });
  readonly notFound = computed(
    () => this.isEdit() && this.expenseService.loaded() && !this.expenseService.loadFailed() && !this.editing()
  );

  readonly form = this.fb.group({
    title: ['', [notBlank, Validators.maxLength(TITLE_MAX_LENGTH)]],
    // Nullable so the field is blank (not "0") on a fresh form.
    amount: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(AMOUNT_MIN),
      Validators.max(AMOUNT_MAX),
      twoDecimals
    ]),
    category: ['Food' as ExpenseCategory, Validators.required],
    date: [localToday(), Validators.required]
  });

  constructor() {
    // Expenses load from the API after first render, so fill the form once the
    // expense being edited becomes available.
    effect(() => {
      const expense = this.editing();
      if (expense) {
        const { title, amount, category, date } = expense;
        this.form.reset({ title, amount, category, date });
      }
    });
  }

  async submit(): Promise<void> {
    const { title: rawTitle, amount, category, date } = this.form.getRawValue();
    if (this.form.invalid || amount === null) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.saving()) {
      return;
    }
    const title = rawTitle.trim();
    const expense = { title, amount, category, date };
    const id = this.id();

    this.saving.set(true);
    try {
      if (id !== undefined) {
        if (await this.expenseService.edit(id, expense)) {
          await this.router.navigate(['/expenses']);
        }
        return;
      }

      if (await this.expenseService.add(expense)) {
        this.lastAdded.set(title);
        this.form.reset({ title: '', amount: null, category, date });
      }
    } finally {
      this.saving.set(false);
    }
  }
}

/** Like Validators.required, but also rejects whitespace-only text (the API trims titles). */
function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim().length === 0 ? { required: true } : null;
}

function twoDecimals(control: AbstractControl<number | null>): ValidationErrors | null {
  const value = control.value;
  return value === null || hasAtMostTwoDecimals(value) ? null : { decimals: true };
}

/** Today in the user's time zone as YYYY-MM-DD (toISOString() would give the UTC date). */
function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
