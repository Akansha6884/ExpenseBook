import { HttpErrorResponse } from '@angular/common/http';

/** Turns a failed request into a reason the user can act on. */
export function describeError(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) {
    return 'Please try again.';
  }
  if (err.status === 0) {
    return "Can't reach the server. Is the API running?";
  }
  const body: unknown = err.error;
  if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
    return body.error;
  }
  return `The server responded with an error (${err.status}).`;
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 401;
}
