import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { User } from '../src/app/auth/auth.model';
import { Db } from './db';

export const SESSION_DAYS = 30;

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

/** Sessions are stored as a SHA-256 of the token, so a leaked database can't be used to sign in. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class UserRepository {
  constructor(private readonly db: Db) {}

  findByEmail(email: string): (User & { passwordHash: string }) | null {
    const row = this.db.prepare<[string], UserRow>('SELECT id, email, password_hash FROM users WHERE email = ?').get(email);
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash } : null;
  }

  /**
   * Creates the user. The very first account also takes ownership of any
   * expenses saved before accounts existed (user_id IS NULL).
   */
  create(email: string, passwordHash: string): User {
    const user: User = { id: randomUUID(), email };
    this.db.transaction(() => {
      this.db
        .prepare<[string, string, string, string]>('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .run(user.id, email, passwordHash, new Date().toISOString());
      const { count } = this.db.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM users').get() ?? { count: 0 };
      if (count === 1) {
        this.db.prepare<[string]>('UPDATE expenses SET user_id = ? WHERE user_id IS NULL').run(user.id);
      }
    })();
    return user;
  }

  /** Returns the raw token for the cookie; only its hash is stored. */
  createSession(userId: string, now = new Date()): string {
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    this.db
      .prepare<[string, string, string]>('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(hashToken(token), userId, expires.toISOString());
    return token;
  }

  /** The signed-in user for a session token, or null if it's unknown or expired. */
  userForSession(token: string, now = new Date()): User | null {
    const row = this.db
      .prepare<[string, string], { id: string; email: string }>(
        `SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ? AND sessions.expires_at > ?`
      )
      .get(hashToken(token), now.toISOString());
    return row ?? null;
  }

  deleteSession(token: string): void {
    this.db.prepare<[string]>('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }

  deleteExpiredSessions(now = new Date()): void {
    this.db.prepare<[string]>('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString());
  }
}
