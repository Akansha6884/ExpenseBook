// Shared by the Angular app and the API (api/auth.router.ts). No Angular imports.

export interface User {
  id: string;
  email: string;
}

export interface Credentials {
  email: string;
  password: string;
}

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;
export const EMAIL_MAX_LENGTH = 254;

/** Deliberately simple: something@something.something, no spaces. */
export function isValidEmail(email: string): boolean {
  return email.length <= EMAIL_MAX_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
