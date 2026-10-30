import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { User } from '../auth/auth.model';
import { AUTH_API, AuthService } from '../auth/auth.service';

export const TEST_USER: User = { id: 'u1', email: 'me@example.com' };

/** Waits for timers and microtasks, which is when effects (like ExpenseService's load) run. */
export function settle(): Promise<void> {
  return new Promise((done) => setTimeout(done));
}

/** Answers the "who is signed in?" check with `user`, then waits until ExpenseService has asked for the book. */
export async function signIn(http: HttpTestingController, user: User = TEST_USER): Promise<void> {
  const checked = TestBed.inject(AuthService).ensureChecked();
  http.expectOne({ method: 'GET', url: `${AUTH_API}/me` }).flush(user);
  await checked;
  await settle();
}
