# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Expense Book: Angular 18 app (standalone components, SSR + prerendering) to add, edit and delete expenses, backed by an Express REST API and a SQLite database.

## Commands

- `npm run dev` — **use this for development**: runs the API (port 3000, `tsx watch`) and `ng serve` (port 4200) together. `ng serve` alone has no backend, and the UI shows "Couldn't load expenses".
- `npm run api` — API only
- `npm run build` — production build to `dist/expense-book/` (`browser/` + `server/`), prerenders static routes
- `npm run serve:ssr:expense-book` — built SSR server with the API mounted (port 4000, or `PORT`); requires `npm run build` first
- `npm test` — Angular unit tests (Karma + Jasmine, watch mode)
  - Once, headless: `npx ng test --watch=false --browsers=ChromeHeadless`
  - Single file: `npx ng test --include src/app/expenses/expense.service.spec.ts` (or temporarily use `fdescribe`/`fit`)
- `npm run test:api` — API tests (`node:test` via tsx, in-memory SQLite)
- `npm run typecheck:api` — type-check `api/` (the Angular build doesn't type-check `api/` except what `server.ts` imports)

No linter is configured (no ESLint / `ng lint` target).

## Architecture

- **Data flow**: components → `ExpenseService` (`src/app/expenses/expense.service.ts`, signals + `HttpClient`) → `/api/expenses` → `api/expenses.router.ts` (validation) → `api/db.ts` (`ExpenseRepository`, better-sqlite3). `api/app.ts` (`apiRouter`) mounts `/auth` and `/expenses`.
- **Accounts**: anyone can sign up (`api/auth.router.ts`: `/signup`, `/login`, `/logout`, `/me`). Passwords are scrypt-hashed (`api/passwords.ts`); the session is a random token in the httpOnly `eb_session` cookie, and only its sha256 is stored (`api/users.ts`, 30 days). Login is rate-limited per IP. `requireUser` guards every `/api/expenses` route, and **every `ExpenseRepository` method takes `userId` and filters by `user_id`**, so a new query must too. Shared rules live in `src/app/auth/auth.model.ts`. The first account created claims expenses with no owner (data from before accounts existed).
- **Frontend auth**: `AuthService.user` is null on the server and until `ensureChecked()` (GET `/api/auth/me`) finishes. `signedInGuard` / `guestGuard` (`auth.guards.ts`) let every route through on the server and decide in the browser. `sessionInterceptor` turns a 401 from a non-auth endpoint into sign-out → `/login` (and `ExpenseService` shows no banner for 401). `ExpenseService` and `ExpenseFilterStore` follow `auth.user()` with an `effect`: the book reloads on sign-in and clears on sign-out.
- **Export**: `GET /api/expenses/export.csv` and `/export.xlsx` (`api/export.ts`, ExcelJS) take the list's filters as query params (`toQueryParams` / `parseFilterCriteria` in `expense-filters.ts`), so the file matches the list. CSV cells starting with `= + - @` are prefixed with `'` (formula injection). `exceljs` is in `externalDependencies` like better-sqlite3.
- **One API, two hosts**: in dev, `api/main.ts` serves it on port 3000 and `ng serve` proxies `/api` there (`proxy.conf.json`, wired via `serve.options.proxyConfig` in `angular.json`). In production, `server.ts` mounts the same router, so it's a single process. Angular 18's dev server does **not** run `server.ts`.
- **Database**: file at `data/expense-book.db` (gitignored, created on first run; override with `DB_PATH`, `:memory:` for tests). The schema is created in `api/db.ts` with `CREATE TABLE IF NOT EXISTS`. There are no migrations, so changing columns on an existing DB needs a manual migration. Order is newest first, by `rowid`.
- **Shared types**: `src/app/expenses/expense.model.ts` (`Expense`, `NewExpense`, `EXPENSE_CATEGORIES`) is imported by both Angular and `api/`. Adding a field or category means changing the model, the DB schema/CHECK, `parseNewExpense`, and the form.
- **Validation runs on both sides**: form validators in `ExpenseFormComponent` and `parseNewExpense` in the router must stay in sync. Limits are shared constants in `expense.model.ts` (`TITLE_MAX_LENGTH`, `AMOUNT_MIN`, `AMOUNT_MAX`, `hasAtMostTwoDecimals`). The rules: title 1–60 chars **after trimming**, amount 0.01–1,000,000,000 with at most 2 decimals, a known category, and a valid `YYYY-MM-DD` date (the default is the user's **local** date, not `toISOString()`).
- **API errors are always JSON** `{ error: string }` (the router's `jsonErrors` handler covers bad JSON, 413 and 500). `ExpenseService` shows that message in the banner. "Is the API running?" appears only for network failures (status 0).
- **ExpenseService contract**: `add`/`edit`/`remove` return `Promise<boolean>` (false on failure) and update the `expenses` signal only after the API succeeds. Failures set the `error` signal, which the app shell shows as a banner. `loaded` turns true after the first fetch.
- **Routing**: `/expenses` (list, default), `/summary` (totals and charts), and `/add` and `/edit/:id`, which both use `ExpenseFormComponent`. `id` arrives as a signal `input()` via `withComponentInputBinding()`.
- **Filtering, sorting and stats run in the browser** over `ExpenseService.expenses()`. There are no API query params. Pure functions live in `expense-filters.ts` (`filterAndSort`) and `expense-stats.ts` (`monthlyTotals`, `categoryTotals`), and each has its own spec. `ExpenseFilterStore` (root) keeps the list's filters while the user goes to Add/Edit and back.
- **Charts** on `/summary` are plain HTML/CSS bars, with no chart library. Each chart is a single series in one validated blue (`#2a78d6`), with a hover/focus tooltip and a table view. Keep the value label positioned **absolutely** above the bar: inside the flex column it shrinks the bar it labels.
- **SSR / prerender**: nothing calls the API on the server (the user is unknown there), so prerendered pages are signed-out "Loading…" shells, and the browser decides after hydration. Code must not touch `window`/`document`/`localStorage` during render.
- **Server bootstrap**: `src/main.server.ts` must pass the `BootstrapContext` through to `bootstrapApplication(AppComponent, config, context)`. The patched Angular 18.2 (CVE-2025-59052) fails with NG0210 "document is not available" without it.
- **Tests**: Angular specs fake the API with `provideHttpClientTesting()` + `HttpTestingController`. Sign in with `await signIn(http)` from `src/app/testing/sign-in.ts` (answers `/api/auth/me`, which triggers the GET), then `expectOne(EXPENSES_API).flush(...)` and `await settle()` **before** `fixture.whenStable()`: the load runs from an effect outside the zone, so `whenStable()` alone resolves too early.

## Constraints

- **better-sqlite3 is pinned to v11**: v12+ ships no prebuilt binary for Node 20 on Windows, and this machine can't compile native modules. Don't upgrade unless Node is ≥ 22. It is listed in `externalDependencies` in `angular.json` so esbuild doesn't bundle the native module.
- Production budgets (`angular.json`): initial bundle warns at 500kB / errors at 1MB; **per-component styles warn at 2kB / error at 4kB**. Keep component SCSS small or move shared styles to `src/styles.scss`.
- Style: 2-space indent, single quotes in TypeScript (`.editorconfig`). TypeScript is in strict mode.
- **Never use `any`**: not in variable declarations, parameters, return types, generics, or `as any` casts. Define an `interface`/`type` for the shape instead; use `unknown` (then narrow) when the type is genuinely unknown. Note that Express's `req.body` is typed `any`, so read it as `req.body as unknown`.
