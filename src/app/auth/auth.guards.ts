import { isPlatformServer } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// On the server both guards let the route render: the user is unknown there, and the
// prerendered pages are the signed-out "Loading…" shells. The browser decides after hydration.

/** Pages that need a signed-in user; others go to /login. */
export const signedInGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (isPlatformServer(inject(PLATFORM_ID))) {
    return true;
  }
  await auth.ensureChecked();
  return auth.user() ? true : router.createUrlTree(['/login']);
};

/** Sign-in and sign-up pages; already signed-in users go to their expenses. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (isPlatformServer(inject(PLATFORM_ID))) {
    return true;
  }
  await auth.ensureChecked();
  return auth.user() ? router.createUrlTree(['/expenses']) : true;
};
