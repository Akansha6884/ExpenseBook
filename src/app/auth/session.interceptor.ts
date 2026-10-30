import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { isUnauthorized } from '../http-errors';
import { AUTH_API, AuthService } from './auth.service';

/** A 401 from the expenses API means the session expired: send the user to sign in again. */
export const sessionInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  return next(req).pipe(
    catchError((err: unknown) => {
      // Auth endpoints answer 401 for wrong passwords and "not signed in"; their callers handle it.
      if (isUnauthorized(err) && !req.url.startsWith(AUTH_API)) {
        auth.sessionEnded();
      }
      return throwError(() => err);
    })
  );
};
