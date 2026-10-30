import express, { Router } from 'express';
import { authRouter } from './auth.router';
import { Db, ExpenseRepository } from './db';
import { expensesRouter } from './expenses.router';
import { UserRepository } from './users';

/** All API routes, ready to mount at `/api` (used by api/main.ts, server.ts and the tests). */
export function apiRouter(db: Db): Router {
  const users = new UserRepository(db);
  const router = express.Router();
  router.use('/auth', authRouter(users));
  router.use('/expenses', expensesRouter(new ExpenseRepository(db), users));
  return router;
}
