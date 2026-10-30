import express, { Router } from 'express';
import {
  AMOUNT_MAX,
  AMOUNT_MIN,
  EXPENSE_CATEGORIES,
  ExpenseCategory,
  NewExpense,
  TITLE_MAX_LENGTH,
  hasAtMostTwoDecimals
} from '../src/app/expenses/expense.model';
import { filterAndSort, parseFilterCriteria } from '../src/app/expenses/expense-filters';
import { currentUser, requireUser } from './auth.router';
import { ExpenseRepository } from './db';
import { exportFileName, toCsv, toXlsx } from './export';
import { jsonErrors } from './http';
import { UserRepository } from './users';

type ParseResult = { ok: true; value: NewExpense } | { ok: false; error: string };

/** REST endpoints for the signed-in user's expenses; mount at `/api/expenses`. */
export function expensesRouter(repo: ExpenseRepository, users: UserRepository): Router {
  const router = Router();
  router.use(requireUser(users));
  router.use(express.json());

  router.get('/', (req, res) => {
    res.json(repo.list(currentUser(req).id));
  });

  // Same filters and sort as the list page (see expense-filters.ts), passed as query params.
  router.get('/export.csv', (req, res) => {
    const expenses = filterAndSort(repo.list(currentUser(req).id), parseFilterCriteria(req.query));
    res.attachment(exportFileName('csv')).type('text/csv; charset=utf-8').send(toCsv(expenses));
  });

  router.get('/export.xlsx', async (req, res, next) => {
    try {
      const expenses = filterAndSort(repo.list(currentUser(req).id), parseFilterCriteria(req.query));
      res
        .attachment(exportFileName('xlsx'))
        .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .send(await toXlsx(expenses));
    } catch (err) {
      next(err);
    }
  });

  router.post('/', (req, res) => {
    const parsed = parseNewExpense(req.body as unknown);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    res.status(201).json(repo.create(currentUser(req).id, parsed.value));
  });

  router.put('/:id', (req, res) => {
    const parsed = parseNewExpense(req.body as unknown);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const updated = repo.update(currentUser(req).id, req.params.id, parsed.value);
    if (!updated) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    res.json(updated);
  });

  router.delete('/:id', (req, res) => {
    if (!repo.delete(currentUser(req).id, req.params.id)) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    res.status(204).end();
  });

  router.use(jsonErrors);

  return router;
}

/** Validates a request body; mirrors the rules in ExpenseFormComponent. */
export function parseNewExpense(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Body must be a JSON object' };
  }
  const { title, amount, category, date } = body as Record<string, unknown>;

  if (typeof title !== 'string' || title.trim().length === 0 || title.trim().length > TITLE_MAX_LENGTH) {
    return { ok: false, error: `Title must be 1-${TITLE_MAX_LENGTH} characters.` };
  }
  if (
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    amount < AMOUNT_MIN ||
    amount > AMOUNT_MAX ||
    !hasAtMostTwoDecimals(amount)
  ) {
    return { ok: false, error: `Amount must be between ${AMOUNT_MIN} and ${AMOUNT_MAX}, with at most 2 decimal places.` };
  }
  if (typeof category !== 'string' || !isCategory(category)) {
    return { ok: false, error: `Category must be one of: ${EXPENSE_CATEGORIES.join(', ')}.` };
  }
  if (typeof date !== 'string' || !isIsoDate(date)) {
    return { ok: false, error: 'Date must be a valid YYYY-MM-DD date.' };
  }

  return { ok: true, value: { title: title.trim(), amount, category, date } };
}

function isCategory(value: string): value is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}
