import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { describeError } from '../http-errors';
import { Credentials, User } from './auth.model';

export const AUTH_API = '/api/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly userSignal = signal<User | null>(null);
  private checking: Promise<void> | undefined;

  /** The signed-in user; always null during SSR and until `ensureChecked()` finishes. */
  readonly user = this.userSignal.asReadonly();

  /** Asks the API who is signed in, once (later calls reuse the answer). Does nothing on the server. */
  ensureChecked(): Promise<void> {
    if (!this.isBrowser) {
      return Promise.resolve();
    }
    this.checking ??= firstValueFrom(this.http.get<User>(`${AUTH_API}/me`)).then(
      (user) => this.userSignal.set(user),
      () => this.userSignal.set(null)
    );
    return this.checking;
  }

  /** Resolves to an error message, or null once signed in. */
  login(credentials: Credentials): Promise<string | null> {
    return this.authenticate('login', credentials);
  }

  /** Resolves to an error message, or null once the account exists and is signed in. */
  signup(credentials: Credentials): Promise<string | null> {
    return this.authenticate('signup', credentials);
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${AUTH_API}/logout`, null));
    } catch {
      // Signed out locally either way; the session expires on its own.
    }
    this.sessionEnded();
  }

  /** Forgets the user and goes to the sign-in page (also used when a request comes back 401). */
  sessionEnded(): void {
    this.userSignal.set(null);
    void this.router.navigateByUrl('/login');
  }

  private async authenticate(action: 'login' | 'signup', credentials: Credentials): Promise<string | null> {
    try {
      const user = await firstValueFrom(this.http.post<User>(`${AUTH_API}/${action}`, credentials));
      this.checking = Promise.resolve();
      this.userSignal.set(user);
      return null;
    } catch (err: unknown) {
      return describeError(err);
    }
  }
}
