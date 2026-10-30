import { Component, computed, inject, input, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, isValidEmail, normalizeEmail } from '../auth.model';
import { AuthService } from '../auth.service';

export type AuthMode = 'login' | 'signup';

@Component({
  selector: 'app-auth-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './auth-form.component.html',
  styleUrl: './auth-form.component.scss'
})
export class AuthFormComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  /** From the route's `data` (see app.routes.ts) via withComponentInputBinding(). */
  readonly mode = input<AuthMode>('login');

  readonly isSignup = computed(() => this.mode() === 'signup');
  readonly passwordMinLength = PASSWORD_MIN_LENGTH;
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  // Length rules only matter when choosing a password; sign-in just needs one.
  readonly form = this.fb.group({
    email: ['', [Validators.required, validEmail]],
    password: ['', [Validators.required, Validators.maxLength(PASSWORD_MAX_LENGTH)]]
  });

  async submit(): Promise<void> {
    const { email, password } = this.form.getRawValue();
    const tooShort = this.isSignup() && password.length < PASSWORD_MIN_LENGTH;
    if (this.form.invalid || tooShort) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    try {
      const credentials = { email: normalizeEmail(email), password };
      const error = this.isSignup() ? await this.auth.signup(credentials) : await this.auth.login(credentials);
      if (error) {
        this.error.set(error);
        return;
      }
      await this.router.navigateByUrl('/expenses');
    } finally {
      this.submitting.set(false);
    }
  }

  passwordTooShort(): boolean {
    const password = this.form.controls.password;
    return this.isSignup() && password.touched && password.value.length > 0 && password.value.length < PASSWORD_MIN_LENGTH;
  }
}

function validEmail(control: AbstractControl<string>): ValidationErrors | null {
  const email = normalizeEmail(control.value);
  return email === '' || isValidEmail(email) ? null : { email: true };
}
