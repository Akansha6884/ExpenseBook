import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import ExcelJS from 'exceljs';
import express from 'express';
import { User } from '../src/app/auth/auth.model';
import { Expense, NewExpense } from '../src/app/expenses/expense.model';
import { apiRouter } from './app';
import { parseCredentials } from './auth.router';
import { Db, ExpenseRepository, openDatabase } from './db';
import { parseNewExpense } from './expenses.router';
import { toCsv } from './export';
import { UserRepository } from './users';

const lunch: NewExpense = { title: 'Lunch', amount: 250, category: 'Food', date: '2026-10-01' };
const taxi: NewExpense = { title: 'Taxi', amount: 400, category: 'Travel', date: '2026-10-02' };
const password = 'correct horse battery';

interface Reply {
  status: number;
  data: unknown;
  headers: Headers;
  raw: ArrayBuffer;
}

/** A browser-like client: remembers the session cookie between requests. */
class Client {
  cookie: string | null = null;

  constructor(private readonly base: string) {}

  async call(method: string, path: string, body?: unknown): Promise<Reply> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookie) headers['Cookie'] = this.cookie;
    const res = await fetch(this.base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const pair = setCookie.split(';')[0];
      this.cookie = pair.endsWith('=') ? null : pair;
    }
    const raw = await res.arrayBuffer();
    const text = new TextDecoder().decode(raw);
    const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
    return { status: res.status, data: isJson && text ? (JSON.parse(text) as unknown) : text, headers: res.headers, raw };
  }

  async signUp(email: string): Promise<User> {
    const res = await this.call('POST', '/auth/signup', { email, password });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    return res.data as User;
  }

  async add(expense: NewExpense): Promise<Expense> {
    const res = await this.call('POST', '/expenses', expense);
    assert.equal(res.status, 201, JSON.stringify(res.data));
    return res.data as Expense;
  }
}

describe('Expense API', () => {
  let db: Db;
  let server: Server;
  let base: string;
  let alice: Client;
  let bob: Client;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    const app = express();
    app.use('/api', apiRouter(db));
    server = app.listen(0);
    await new Promise<void>((done) => server.once('listening', done));
    base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
    alice = new Client(base);
    bob = new Client(base);
  });

  afterEach(() => {
    server.close();
    db.close();
  });

  describe('accounts', () => {
    it('sign up creates the account, sets an httpOnly session cookie, and /me returns the user', async () => {
      const res = await alice.call('POST', '/auth/signup', { email: '  Alice@Example.COM ', password });

      assert.equal(res.status, 201);
      assert.equal((res.data as User).email, 'alice@example.com');
      const setCookie = res.headers.get('set-cookie') ?? '';
      assert.match(setCookie, /^eb_session=/);
      assert.match(setCookie, /HttpOnly/i);
      assert.match(setCookie, /SameSite=Lax/i);
      assert.deepEqual((await alice.call('GET', '/auth/me')).data, res.data);
    });

    it('stores a salted hash, never the password', async () => {
      await alice.signUp('alice@example.com');
      await bob.signUp('bob@example.com');

      const rows = db.prepare<[], { password_hash: string }>('SELECT password_hash FROM users').all();
      assert.ok(rows.every((r) => r.password_hash.startsWith('scrypt$') && !r.password_hash.includes(password)));
      assert.notEqual(rows[0].password_hash, rows[1].password_hash);
    });

    it('rejects invalid sign-ups', async () => {
      assert.equal((await alice.call('POST', '/auth/signup', { email: 'not-an-email', password })).status, 400);
      const short = await alice.call('POST', '/auth/signup', { email: 'a@b.co', password: 'short' });
      assert.deepEqual(short.data, { error: 'Password must be at least 8 characters.' });
      assert.equal(alice.cookie, null);
    });

    it('refuses a second account with the same email, in any letter case', async () => {
      await alice.signUp('alice@example.com');
      const res = await bob.call('POST', '/auth/signup', { email: 'ALICE@example.com', password });
      assert.equal(res.status, 409);
    });

    it('signs in with the right password, and gives the same error for a wrong password or unknown email', async () => {
      await alice.signUp('alice@example.com');
      const fresh = new Client(base);

      const wrong = await fresh.call('POST', '/auth/login', { email: 'alice@example.com', password: 'nope-nope' });
      const unknown = await fresh.call('POST', '/auth/login', { email: 'nobody@example.com', password });
      assert.deepEqual([wrong.status, unknown.status], [401, 401]);
      assert.deepEqual(wrong.data, unknown.data);
      assert.equal(fresh.cookie, null);

      const ok = await fresh.call('POST', '/auth/login', { email: 'Alice@Example.com', password });
      assert.equal(ok.status, 200);
      assert.equal((await fresh.call('GET', '/auth/me')).status, 200);
    });

    it('signing out ends the session, even if the old cookie is replayed', async () => {
      await alice.signUp('alice@example.com');
      const stolen = alice.cookie;

      assert.equal((await alice.call('POST', '/auth/logout')).status, 204);
      assert.equal(alice.cookie, null);

      const replay = new Client(base);
      replay.cookie = stolen;
      assert.equal((await replay.call('GET', '/expenses')).status, 401);
    });

    it('rejects expired sessions', async () => {
      const user = await alice.signUp('alice@example.com');
      const users = new UserRepository(db);
      const oldToken = users.createSession(user.id, new Date('2020-01-01'));

      const old = new Client(base);
      old.cookie = `eb_session=${oldToken}`;
      assert.equal((await old.call('GET', '/auth/me')).status, 401);
    });

    it('limits repeated failed sign-ins', async () => {
      await alice.signUp('alice@example.com');
      const attacker = new Client(base);
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        statuses.push((await attacker.call('POST', '/auth/login', { email: 'alice@example.com', password: `guess-${i}` })).status);
      }
      assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
      assert.equal(statuses[10], 429);
    });
  });

  describe('expenses', () => {
    beforeEach(async () => {
      await alice.signUp('alice@example.com');
    });

    it('require sign-in', async () => {
      const anonymous = new Client(base);
      for (const [method, path] of [['GET', '/expenses'], ['POST', '/expenses'], ['GET', '/expenses/export.csv'], ['DELETE', '/expenses/x']]) {
        const res = await anonymous.call(method, path, method === 'POST' ? lunch : undefined);
        assert.deepEqual([res.status, res.data], [401, { error: 'Please sign in.' }], `${method} ${path}`);
      }
    });

    it('GET returns an empty list initially', async () => {
      assert.deepEqual((await alice.call('GET', '/expenses')).data, []);
    });

    it('POST creates an expense with an id, and GET lists newest first', async () => {
      const created = await alice.add(lunch);
      await alice.add(taxi);

      assert.ok(created.id);
      assert.deepEqual({ ...created, id: undefined }, { ...lunch, id: undefined });
      const list = (await alice.call('GET', '/expenses')).data as Expense[];
      assert.deepEqual(
        list.map((e) => e.title),
        ['Taxi', 'Lunch']
      );
    });

    it('POST trims the title', async () => {
      assert.equal((await alice.add({ ...lunch, title: '  Lunch  ' })).title, 'Lunch');
    });

    it('POST rejects invalid data with 400 and saves nothing', async () => {
      const res = await alice.call('POST', '/expenses', { ...lunch, amount: 0 });

      assert.equal(res.status, 400);
      assert.match((res.data as { error: string }).error, /^Amount must be/);
      assert.deepEqual((await alice.call('GET', '/expenses')).data, []);
    });

    it('answers malformed JSON with a JSON 400, not an HTML stack trace', async () => {
      const res = await fetch(`${base}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: alice.cookie ?? '' },
        body: '{bad json'
      });

      assert.equal(res.status, 400);
      assert.match(res.headers.get('content-type') ?? '', /application\/json/);
      assert.deepEqual(await res.json(), { error: 'Request body must be valid JSON' });
    });

    it('answers an oversized body with a JSON 413', async () => {
      const res = await alice.call('POST', '/expenses', { ...lunch, title: 'x'.repeat(200_000) });
      assert.deepEqual([res.status, res.data], [413, { error: 'Request body is too large' }]);
    });

    it('PUT updates an expense and keeps its position', async () => {
      const first = await alice.add(lunch);
      await alice.add(taxi);

      const res = await alice.call('PUT', `/expenses/${first.id}`, { ...lunch, title: 'Dinner', amount: 600 });

      assert.deepEqual([res.status, res.data], [200, { ...lunch, title: 'Dinner', amount: 600, id: first.id }]);
      const list = (await alice.call('GET', '/expenses')).data as Expense[];
      assert.deepEqual(
        list.map((e) => e.title),
        ['Taxi', 'Dinner']
      );
    });

    it('PUT returns 404 for an unknown id and 400 for invalid data', async () => {
      assert.equal((await alice.call('PUT', '/expenses/missing', lunch)).status, 404);
      const created = await alice.add(lunch);
      assert.equal((await alice.call('PUT', `/expenses/${created.id}`, { ...lunch, category: 'Rent' })).status, 400);
    });

    it('DELETE removes an expense, then returns 404 for it', async () => {
      const created = await alice.add(lunch);

      assert.equal((await alice.call('DELETE', `/expenses/${created.id}`)).status, 204);
      assert.deepEqual((await alice.call('GET', '/expenses')).data, []);
      assert.equal((await alice.call('DELETE', `/expenses/${created.id}`)).status, 404);
    });

    it("keeps each user's book private: no reading, editing or deleting someone else's expense", async () => {
      const alicesLunch = await alice.add(lunch);
      await bob.signUp('bob@example.com');
      await bob.add(taxi);

      assert.deepEqual(((await bob.call('GET', '/expenses')).data as Expense[]).map((e) => e.title), ['Taxi']);
      assert.equal((await bob.call('PUT', `/expenses/${alicesLunch.id}`, { ...lunch, amount: 1 })).status, 404);
      assert.equal((await bob.call('DELETE', `/expenses/${alicesLunch.id}`)).status, 404);
      assert.deepEqual((await alice.call('GET', '/expenses')).data, [alicesLunch]);

      const bobsCsv = (await bob.call('GET', '/expenses/export.csv')).data as string;
      assert.ok(!bobsCsv.includes('Lunch'));
    });
  });

  describe('export', () => {
    beforeEach(async () => {
      await alice.signUp('alice@example.com');
      await alice.add({ title: 'Rent', amount: 15000, category: 'Bills', date: '2026-09-01' });
      await alice.add({ title: 'Tea, "masala"', amount: 20.5, category: 'Food', date: '2026-10-05' });
      await alice.add({ title: '=HYPERLINK("http://evil")', amount: 1, category: 'Other', date: '2026-10-06' });
    });

    it('CSV downloads as a dated attachment with a BOM, header and quoted cells', async () => {
      const res = await alice.call('GET', '/expenses/export.csv');
      const text = res.data as string;

      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/csv/);
      assert.match(res.headers.get('content-disposition') ?? '', /attachment; filename="expenses-\d{4}-\d{2}-\d{2}\.csv"/);
      assert.equal(new Uint8Array(res.raw).slice(0, 3).join(','), '239,187,191'); // UTF-8 BOM
      assert.deepEqual(text.replace('﻿', '').split('\r\n'), [
        'Date,Title,Category,Amount (INR)',
        `2026-10-06,"'=HYPERLINK(""http://evil"")",Other,1.00`,
        '2026-10-05,"Tea, ""masala""",Food,20.50',
        '2026-09-01,Rent,Bills,15000.00',
        ''
      ]);
    });

    it('applies the same filters and sort as the list', async () => {
      const res = await alice.call('GET', '/expenses/export.csv?from=2026-10-01&sort=amount-desc&category=Food');
      const lines = (res.data as string).trim().split('\r\n');
      assert.deepEqual(lines.slice(1), ['2026-10-05,"Tea, ""masala""",Food,20.50']);
    });

    it('ignores invalid filter values instead of failing', async () => {
      const res = await alice.call('GET', '/expenses/export.csv?category=Nope&sort=random&from=yesterday');
      assert.equal((res.data as string).trim().split('\r\n').length, 4);
    });

    it('Excel export is a real workbook with dates, currency amounts, filters and a total', async () => {
      const res = await alice.call('GET', '/expenses/export.xlsx?sort=date-asc');

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      assert.match(res.headers.get('content-disposition') ?? '', /filename="expenses-\d{4}-\d{2}-\d{2}\.xlsx"/);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.raw);
      const sheet = workbook.getWorksheet('Expenses');
      assert.ok(sheet);
      assert.deepEqual([1, 2, 3, 4].map((col) => sheet.getRow(1).getCell(col).value), ['Date', 'Title', 'Category', 'Amount (INR)']);
      assert.equal(sheet.getRow(1).font?.bold, true);

      const first = sheet.getRow(2);
      assert.ok(first.getCell(1).value instanceof Date);
      assert.equal((first.getCell(1).value as Date).toISOString(), '2026-09-01T00:00:00.000Z');
      assert.equal(first.getCell(2).value, 'Rent');
      assert.equal(first.getCell(4).value, 15000);
      assert.equal(first.getCell(4).numFmt, '"₹"#,##0.00');

      // The formula-looking title is stored as plain text.
      assert.equal(sheet.getRow(4).getCell(2).value, '=HYPERLINK("http://evil")');

      const total = sheet.getRow(5);
      assert.equal(total.getCell(2).value, 'Total');
      assert.deepEqual(total.getCell(4).value, { formula: 'SUM(D2:D4)', result: 15021.5 });
    });

    it('exports an empty book as just the header', async () => {
      await bob.signUp('bob@example.com');
      // TextDecoder drops the BOM; the CSV test above checks the raw bytes for it.
      assert.equal(((await bob.call('GET', '/expenses/export.csv')).data as string).trim(), 'Date,Title,Category,Amount (INR)');
      assert.equal((await bob.call('GET', '/expenses/export.xlsx')).status, 200);
    });
  });
});

describe('database file', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'expense-book-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps data between connections', () => {
    const file = join(dir, 'test.db');

    const writer = openDatabase(file);
    const user = new UserRepository(writer).create('a@b.co', 'scrypt$00$00');
    new ExpenseRepository(writer).create(user.id, lunch);
    writer.close();

    const reader = openDatabase(file);
    assert.deepEqual(
      new ExpenseRepository(reader).list(user.id).map((e) => e.title),
      ['Lunch']
    );
    reader.close();
  });

  it('upgrades a database from before accounts, and gives its expenses to the first account only', () => {
    const file = join(dir, 'old.db');
    const old = new Database(file);
    old.exec(`CREATE TABLE expenses (id TEXT PRIMARY KEY, title TEXT NOT NULL, amount REAL NOT NULL,
              category TEXT NOT NULL, date TEXT NOT NULL)`);
    old.prepare("INSERT INTO expenses VALUES ('old-1', 'Old rent', 9000, 'Bills', '2026-01-01')").run();
    old.close();

    const db = openDatabase(file);
    const users = new UserRepository(db);
    const expenses = new ExpenseRepository(db);
    const first = users.create('first@example.com', 'scrypt$00$00');
    const second = users.create('second@example.com', 'scrypt$00$00');

    assert.deepEqual(
      expenses.list(first.id).map((e) => e.id),
      ['old-1']
    );
    assert.deepEqual(expenses.list(second.id), []);
    db.close();
  });
});

describe('parseNewExpense', () => {
  const invalid: [string, unknown][] = [
    ['null body', null],
    ['missing title', { ...lunch, title: undefined }],
    ['blank title', { ...lunch, title: '   ' }],
    ['title over 60 chars', { ...lunch, title: 'x'.repeat(61) }],
    ['amount as string', { ...lunch, amount: '250' }],
    ['negative amount', { ...lunch, amount: -5 }],
    ['amount below 0.01', { ...lunch, amount: 0.001 }],
    ['amount with 3 decimals', { ...lunch, amount: 10.555 }],
    ['amount over the maximum', { ...lunch, amount: 1e308 }],
    ['infinite amount', { ...lunch, amount: Infinity }],
    ['unknown category', { ...lunch, category: 'Rent' }],
    ['badly formatted date', { ...lunch, date: '01-10-2026' }],
    ['impossible date', { ...lunch, date: '2026-02-30' }]
  ];

  for (const [name, body] of invalid) {
    it(`rejects ${name}`, () => {
      assert.equal(parseNewExpense(body).ok, false);
    });
  }

  for (const amount of [0.01, 0.1, 0.2, 1200.5, 19.99, 1_000_000_000]) {
    it(`accepts amount ${amount}`, () => {
      assert.equal(parseNewExpense({ ...lunch, amount }).ok, true);
    });
  }

  it('accepts a valid expense and ignores extra fields', () => {
    assert.deepEqual(parseNewExpense({ ...lunch, id: 'ignored', extra: true }), { ok: true, value: lunch });
  });
});

describe('parseCredentials', () => {
  it('normalises the email and only enforces the minimum length on sign-up', () => {
    assert.deepEqual(parseCredentials({ email: ' A@B.co ', password: 'short' }, false), {
      ok: true,
      value: { email: 'a@b.co', password: 'short' }
    });
    assert.equal(parseCredentials({ email: 'a@b.co', password: 'short' }, true).ok, false);
  });

  it('rejects missing or malformed fields', () => {
    assert.equal(parseCredentials(null, false).ok, false);
    assert.equal(parseCredentials({ email: 'a@b', password: 'x' }, false).ok, false);
    assert.equal(parseCredentials({ email: 'a@b.co', password: '' }, false).ok, false);
    assert.equal(parseCredentials({ email: 'a@b.co', password: 'x'.repeat(201) }, false).ok, false);
  });
});

describe('toCsv', () => {
  it('neutralises every formula prefix', () => {
    const csv = toCsv(['=1', '+1', '-1', '@x'].map((title, i) => ({ ...lunch, id: String(i), title })));
    assert.deepEqual(
      csv.trim().split('\r\n').slice(1).map((line) => line.split(',')[1]),
      ["'=1", "'+1", "'-1", "'@x"]
    );
  });
});
