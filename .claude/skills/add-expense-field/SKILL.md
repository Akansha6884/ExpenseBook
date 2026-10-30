---
name: add-expense-field
description: Add a new field (for example notes, payment method or tags) to expenses, or change an existing one, end to end through the shared model, SQLite schema, API validation, form, list and tests. Use when the user wants expenses to store something new, or wants to rename, remove or change the rules of an expense field or category.
---

# Add or change an expense field

An expense field touches both the Angular app and the API. Missing one place usually still compiles but fails at runtime, so go through **every** step.

Before starting, settle with the user: the field name, its type, whether it's required, its limits (length, range, allowed values) and the default for existing rows.

## 1. Shared model: `src/app/expenses/expense.model.ts`

- Add the field to `Expense`. `NewExpense` is `Omit<Expense, 'id'>`, so it picks the field up automatically.
- For a fixed set of values, add a union type and a `readonly` constant array, as with `ExpenseCategory` / `EXPENSE_CATEGORIES`.
- Put numeric or length limits here as exported constants (like `TITLE_MAX_LENGTH`, `AMOUNT_MIN`, `AMOUNT_MAX`), so the form and the API use the same values.
- Optional fields: use `field?: T` in TypeScript, but `NULL` in SQL, and convert between them in `toExpense`.

## 2. Database: `api/db.ts`

- Add the column to `SCHEMA` with a `CHECK` that matches the validation rules.
- Add it to `COLUMNS`, the `INSERT` (`@field`), the `UPDATE ... SET` and the `ExpenseRow` interface.
- **Existing database files won't get the column**, because the schema uses `CREATE TABLE IF NOT EXISTS`. Add a guarded migration in the constructor after `this.db.exec(SCHEMA)`:
  ```ts
  const columns = this.db.prepare<[], { name: string }>("SELECT name FROM pragma_table_info('expenses')").all();
  if (!columns.some((c) => c.name === 'notes')) {
    this.db.exec("ALTER TABLE expenses ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
  }
  ```
  SQLite's `ALTER TABLE ADD COLUMN` needs a `DEFAULT` for `NOT NULL` columns, and can't add a `CHECK` that references other columns.

## 3. API validation: `api/expenses.router.ts`

- Extend `parseNewExpense`: destructure the field from the body, validate its type and limits, and include it in the returned `value`.
- Read the body as `unknown` and narrow it. Never use `any` (CLAUDE.md rule).

## 4. Form: `src/app/expenses/expense-form/`

- **`.ts`:** add the control to `this.form` with validators that **match step 3 exactly**. In the edit-mode `effect`, add the field to the destructure and `reset({...})`. In `submit()`, decide whether the field survives the post-add `form.reset(...)`, as category and date do.
- **`.html`:** add a `<label>` with the input and an `@if` error message, following the existing fields.

## 5. List: `src/app/expenses/expense-list/expense-list.component.html`

Show the field if it's useful there, usually inside the `<small>` line or `.info` block. Keep component SCSS under the 2kB budget.

## 6. Tests

Update the fixtures (`lunch`, `taxi`, `saved`, `expenses`) in **all** of these, or the type checker fails:
- `api/expenses.test.ts`: add accept and reject cases to the `parseNewExpense` table, and check the field survives POST and PUT.
- `src/app/expenses/expense.service.spec.ts`
- `src/app/expenses/expense-form/expense-form.component.spec.ts`: the field appears in the POST/PUT body and is filled in edit mode.
- `src/app/expenses/expense-list/expense-list.component.spec.ts`: if the field is displayed.

## 7. Verify

Run the `run-checks` skill. Then remind the user that the running API (`npm run api` / `npm run dev`) restarts by itself, and that the migration runs on the next start.

## Removing or renaming a field

Same files in reverse. SQLite supports `ALTER TABLE ... DROP COLUMN` and `RENAME COLUMN` (3.35+, and this project has 3.49). Ask before dropping a column, because that deletes the user's data in it.
