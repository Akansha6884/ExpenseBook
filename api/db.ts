import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { EXPENSE_CATEGORIES, Expense, ExpenseCategory, NewExpense, PAID_TO_MAX_LENGTH } from '../src/app/expenses/expense.model';

/** Default database file; override with the DB_PATH env var (`:memory:` for tests). */
export const DEFAULT_DB_PATH = resolve(process.cwd(), 'data', 'expense-book.db');

export type Db = Database.Database;

const categoryList = EXPENSE_CATEGORIES.map((c) => `'${c}'`).join(', ');

const PAID_TO_COLUMN = `paid_to TEXT NOT NULL DEFAULT '' CHECK (length(paid_to) <= ${PAID_TO_MAX_LENGTH} AND paid_to NOT GLOB '*[^A-Za-z ]*')`;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id       TEXT PRIMARY KEY,
    title    TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 60),
    ${PAID_TO_COLUMN},
    amount   REAL NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL CHECK (category IN (${categoryList})),
    date     TEXT NOT NULL,
    user_id  TEXT REFERENCES users(id) ON DELETE CASCADE
  );
`;

/** Opens (and creates or upgrades) the database. The caller closes it. */
export function openDatabase(file: string = process.env['DB_PATH'] ?? DEFAULT_DB_PATH): Db {
  if (file !== ':memory:') {
    mkdirSync(dirname(file), { recursive: true });
  }
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Upgrades databases created before a column existed. Safe to run on every start. */
function migrate(db: Db): void {
  const columns = db.prepare<[], { name: string }>("SELECT name FROM pragma_table_info('expenses')").all();
  if (!columns.some((c) => c.name === 'user_id')) {
    // Pre-accounts databases: existing rows get NULL and are claimed by the first account.
    db.exec('ALTER TABLE expenses ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
  }
  if (!columns.some((c) => c.name === 'paid_to')) {
    db.exec(`ALTER TABLE expenses ADD COLUMN ${PAID_TO_COLUMN}`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS expenses_user_id ON expenses(user_id)');
}

interface ExpenseRow {
  id: string;
  title: string;
  paid_to: string;
  amount: number;
  category: string;
  date: string;
}

const COLUMNS = 'id, title, paid_to, amount, category, date';

/** Every method is scoped to one user: nobody can read or change another user's expenses. */
export class ExpenseRepository {
  constructor(private readonly db: Db) {}

  /** Newest first (rowid follows insertion order and is kept on UPDATE). */
  list(userId: string): Expense[] {
    return this.db
      .prepare<[string], ExpenseRow>(`SELECT ${COLUMNS} FROM expenses WHERE user_id = ? ORDER BY rowid DESC`)
      .all(userId)
      .map(toExpense);
  }

  create(userId: string, expense: NewExpense): Expense {
    const created: Expense = { ...expense, id: randomUUID() };
    this.db
      .prepare<[Expense & { userId: string }]>(
        `INSERT INTO expenses (${COLUMNS}, user_id) VALUES (@id, @title, @paidTo, @amount, @category, @date, @userId)`
      )
      .run({ ...created, userId });
    return created;
  }

  /** Returns the updated expense, or null if this user has no expense with that id. */
  update(userId: string, id: string, changes: NewExpense): Expense | null {
    const updated: Expense = { ...changes, id };
    const result = this.db
      .prepare<[Expense & { userId: string }]>(
        `UPDATE expenses SET title = @title, paid_to = @paidTo, amount = @amount, category = @category, date = @date
         WHERE id = @id AND user_id = @userId`
      )
      .run({ ...updated, userId });
    return result.changes > 0 ? updated : null;
  }

  /** Returns false if this user has no expense with that id. */
  delete(userId: string, id: string): boolean {
    return this.db.prepare<[string, string]>('DELETE FROM expenses WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
  }
}

function toExpense(row: ExpenseRow): Expense {
  // The CHECK constraint guarantees category is one of EXPENSE_CATEGORIES.
  const { paid_to, ...rest } = row;
  return { ...rest, paidTo: paid_to, category: row.category as ExpenseCategory };
}
