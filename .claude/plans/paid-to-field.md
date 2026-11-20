# Plan: add the optional "Paid to" field

**Spec:** [paid-to-field.md](../spec/paid-to-field.md). Not started: nothing for `paidTo` exists yet. Baseline: API types pass, API tests 49/49, Angular 153/153, build has no warnings. The planner reported that the earlier summary, Excel-only and `/auth/me` work is already committed (`2076aa4`), leaving only this spec untracked. Confirm with `git status` before step 11.

## Steps

- [x] **1. Shared model.** `src/app/expenses/expense.model.ts`: add `paidTo: string` to `Expense` (and so to `NewExpense`), `PAID_TO_MAX_LENGTH = 40`, and `isValidPaidTo(trimmed: string): boolean`, which is true for `''` or for 1–40 characters matching `^[A-Za-z]+( [A-Za-z]+)*$`. Covers AC-11. Done: `paidTo`, `PAID_TO_MAX_LENGTH`, `isValidPaidTo` added to the model.
- [x] **2. Database.** `api/db.ts`: Done: `PAID_TO_COLUMN` in schema and guarded migration; COLUMNS/INSERT/UPDATE/row mapping updated.
  - Add one `PAID_TO_COLUMN` constant, ``paid_to TEXT NOT NULL DEFAULT '' CHECK (length(paid_to) <= ${PAID_TO_MAX_LENGTH} AND paid_to NOT GLOB '*[^A-Za-z ]*')``.
  - Use it in `SCHEMA`, and in a guarded `ALTER TABLE expenses ADD COLUMN` inside `migrate(db)`, with the same `columns.some(...)` check as `user_id`.
  - Add `paid_to` to `COLUMNS`, `@paidTo` to the INSERT, `paid_to = @paidTo` to the UPDATE, and `paid_to: string` to `ExpenseRow`.
  - `COLUMNS` is also the INSERT column list, so map `paid_to` to `paidTo` in `toExpense`.
  - Covers AC-9, AC-10, AC-11.
- [x] **3. API validation and export.** Done: `parseNewExpense` validates and trims; export has Paid to column (amount now E).
  - `api/expenses.router.ts`, `parseNewExpense`: if `paidTo` is missing or `null`, use `''`. If it isn't a string, return "Paid to must be text.". Otherwise trim it and check it with `isValidPaidTo`; if that fails, return "Paid to can only contain letters and spaces (max 40).", with the limit from `PAID_TO_MAX_LENGTH`. Return the trimmed value.
  - `api/export.ts`: add `'Paid to'` to `HEADERS` after Title, and add the value to the CSV row and the xlsx columns.
  - **Amount moves from column D to E**, so update the `autoFilter` range and the `SUM(D2:D…)` formula.
  - Covers AC-7, AC-8, AC-9, AC-11, AC-13.
- [x] **4. API tests.** `api/expenses.test.ts`: Done: fixtures, parse table, POST/PUT, old-schema migration, export tests; API tests 61/61.
  - Fixtures: `lunch` gets `paidTo: ''` and `taxi` gets `'Ola Cabs'`.
  - `parseNewExpense` rejects `'Shop 24'`, `'Ramesh!'`, `'A&B'`, `'Big  Bazaar'`, 41 letters, and `123`. It accepts a missing or `null` value (gives `''`) and `'  Ramesh  '` (gives `'Ramesh'`).
  - POST and PUT: an invalid value gives a JSON 400 and saves nothing. A body without `paidTo` saves `''`. The trimmed value comes back from GET.
  - A database created before this change (old table without `paid_to`) reads back with `paidTo: ''`.
  - Export: update the CSV headers and the xlsx assertions (5 columns, amount in column 5, `SUM(E2:E…)`). Check that Paid to is filled for one row and empty for another, with a filter applied.
  - Covers AC-7, AC-8, AC-9, AC-10, AC-13.
- [x] **5. Form.** `expense-form.component.ts`: Done: `paidToValid` control, edit fill, trim on submit, reset after add, label + errors.
  - Add `paidTo: ['', paidToValid]`. Write `paidToValid` next to `notBlank`, trimming first: it returns `{ maxlength: true }` when the trimmed value is over the limit, otherwise `{ pattern: true }` when `!isValidPaidTo(trimmed)`. Don't use `Validators.maxLength`, because it counts untrimmed spaces.
  - Add `paidTo` to the edit `effect` and `reset`, trim it in `submit()`, and reset it to `''` after an add. Expose `paidToMaxLength`.
  - `.html`: a labelled **Paid to** input after Title, with **no** `maxlength` attribute, because typing isn't blocked. Errors use the same `touched && invalid` `@if` as Title.
  - Leave `anyValue: any` alone.
  - Covers AC-1 to AC-6, AC-11, AC-14.
- [x] **6. List.** `expense-list.component.html`, the `<small>` line: `{{ expense.category }} · @if (expense.paidTo) { Paid to {{ expense.paidTo }} · } {{ date }}`. No SCSS change. Covers AC-12. Done: list detail line shows Paid to when set.
- [x] **7. Angular tests.** Done: all fixtures updated, new form and list cases; Angular 166/166.
  - `paidTo` is required, so add it to every typed `Expense` fixture, including three files the skill doesn't list: `expense-filters.spec.ts`, `summary/summary.component.spec.ts` and `expense-stats.spec.ts`. Also `expense.service.spec.ts`.
  - `expense-form.component.spec.ts`: update `saved` and the expected bodies. Add cases: the field shows in add and edit; the valid values POST; the 4 invalid values and 41 letters show their message and send nothing (read the message from the Paid to label); `'  Ramesh  '` posts `'Ramesh'`; the field is empty after an add.
  - `expense-list.component.spec.ts`: `'Big Bazaar'` shows "Paid to Big Bazaar", and `''` shows no "Paid to".
  - Covers AC-1 to AC-6, AC-12.
- [x] **8. Run every check** with `/run-checks`, then grep the changed files for a hard-coded `40` and for `any`. Covers AC-11, AC-14, AC-15. Done: typecheck:api, test:api 61/61, ng test 166/166, build with no warnings; no new `any`; the only `40`s are in tests.
- [x] **9. Check in a real browser** with `/verifier-web`. Covers AC-1 to AC-6, AC-10, AC-12, AC-13. *Passed in Edge on 2026-11-16: the form errors, trimming, the list line, the Edit fill, and the Excel column with filters. AC-10 passed on the built server with an old-schema scratch database.*
  - Add one valid and one invalid Paid to, and check that the invalid one sends no request.
  - Reload, then check Edit and the list line.
  - Download the Excel file and check the column and the filters.
  - **AC-10:** start the built server on a scratch database with the old schema (`DB_PATH`), **never** `data/expense-book.db`, and confirm its rows load.
- [x] **10. Review** with the `expense-reviewer` agent against the spec. *"Looks good": no bugs. Optional: test PUT with every invalid value, and test that the xlsx export applies filters (only CSV has a filter test).*
- [ ] **11. Commit**, then set the spec's Status to "Done".
  - Commit 1: the spec and this plan.
  - Commit 2: the feature and every spec file, in one commit, because the required `paidTo` breaks compilation until the form and all fixtures are updated.
