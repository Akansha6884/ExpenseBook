import express, { Request, RequestHandler, Response, Router } from 'express';
import {
  Credentials,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  User,
  isValidEmail,
  normalizeEmail
} from '../src/app/auth/auth.model';
import { jsonErrors } from './http';
import { hashPassword, verifyPassword } from './passwords';
import { SESSION_DAYS, UserRepository } from './users';

export const SESSION_COOKIE = 'eb_session';

// Lets a failed login for an unknown email take as long as one with a wrong password.
const DUMMY_HASH = hashPassword('not-a-real-password');

/** The signed-in user for each request that passed `requireUser`. */
const signedInUsers = new WeakMap<Request, User>();

/** The user set by `requireUser`. Only call this in handlers mounted after it. */
export function currentUser(req: Request): User {
  const user = signedInUsers.get(req);
  if (!user) {
    throw new Error('currentUser() called on a route without requireUser');
  }
  return user;
}

/** Rejects the request with 401 unless it carries a valid session cookie. */
export function requireUser(users: UserRepository): RequestHandler {
  return (req, res, next) => {
    const token = readSessionCookie(req);
    const user = token ? users.userForSession(token) : null;
    if (!user) {
      res.status(401).json({ error: 'Please sign in.' });
      return;
    }
    signedInUsers.set(req, user);
    next();
  };
}

/** Sign up, sign in, sign out and "who am I"; mount at `/api/auth`. */
export function authRouter(users: UserRepository): Router {
  const router = Router();
  const loginLimiter = attemptLimiter(10, 15 * 60 * 1000);
  router.use(express.json());

  router.post('/signup', async (req, res, next) => {
    try {
      const parsed = parseCredentials(req.body as unknown, true);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const { email, password } = parsed.value;
      if (users.findByEmail(email)) {
        res.status(409).json({ error: 'An account with this email already exists. Try signing in.' });
        return;
      }
      const user = users.create(email, await hashPassword(password));
      startSession(res, users, user);
      res.status(201).json(user);
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const key = req.ip ?? 'unknown';
      if (!loginLimiter.allow(key)) {
        res.status(429).json({ error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' });
        return;
      }
      const parsed = parseCredentials(req.body as unknown, false);
      const found = parsed.ok ? users.findByEmail(parsed.value.email) : null;
      const valid = parsed.ok && (await verifyPassword(parsed.value.password, found?.passwordHash ?? (await DUMMY_HASH)));
      if (!found || !valid) {
        res.status(401).json({ error: 'Email or password is incorrect.' });
        return;
      }
      loginLimiter.reset(key);
      users.deleteExpiredSessions();
      const user: User = { id: found.id, email: found.email };
      startSession(res, users, user);
      res.json(user);
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (req, res) => {
    const token = readSessionCookie(req);
    if (token) {
      users.deleteSession(token);
    }
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.status(204).end();
  });

  router.get('/me', (req, res) => {
    const token = readSessionCookie(req);
    const user = token ? users.userForSession(token) : null;
    if (!user) {
      res.status(401).json({ error: 'Not signed in.' });
      return;
    }
    res.json(user);
  });

  router.use(jsonErrors);
  return router;
}

type ParseResult = { ok: true; value: Credentials } | { ok: false; error: string };

export function parseCredentials(body: unknown, isSignup: boolean): ParseResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Body must be a JSON object' };
  }
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== 'string' || !isValidEmail(normalizeEmail(email))) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  if (typeof password !== 'string' || password.length === 0 || password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, error: 'Enter your password.' };
  }
  if (isSignup && password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  return { ok: true, value: { email: normalizeEmail(email), password } };
}

function startSession(res: Response, users: UserRepository, user: User): void {
  const token = users.createSession(user.id);
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 });
}

/**
 * httpOnly: page scripts can't read it. sameSite=lax: other sites can't send it with
 * POST/PUT/DELETE requests. secure (HTTPS only) when NODE_ENV=production.
 */
function cookieOptions(): { httpOnly: true; sameSite: 'lax'; secure: boolean; path: string } {
  return { httpOnly: true, sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production', path: '/' };
}

export function readSessionCookie(req: Request): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE && rest.length > 0) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

/** Simple in-memory limiter: at most `max` failed attempts per key per window. */
function attemptLimiter(max: number, windowMs: number): { allow(key: string): boolean; reset(key: string): void } {
  const attempts = new Map<string, { count: number; since: number }>();
  return {
    allow(key) {
      const now = Date.now();
      const entry = attempts.get(key);
      if (!entry || now - entry.since > windowMs) {
        attempts.set(key, { count: 1, since: now });
        return true;
      }
      entry.count += 1;
      return entry.count <= max;
    },
    reset(key) {
      attempts.delete(key);
    }
  };
}
