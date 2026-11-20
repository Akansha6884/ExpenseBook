# Paid to field

**Status:** Implemented and verified (2026-11-16), not committed.

## Overview

Add an optional **Paid to** field to the Add and Edit expense form, for whoever was paid (for example "Big Bazaar" or "Ramesh"). It accepts **only letters and spaces**: digits and symbols are rejected, with an error message on the field.

The value is saved with the expense, shown in the expense list, and added as a column to the Excel export.

## Decisions

| Topic | Decision |
|---|---|
| Field | `paidTo` (TypeScript), `paid_to` (SQLite), labelled **Paid to** |
| Required | No. Empty is allowed, and existing expenses get `''` |
| Allowed characters | A–Z, a–z, and single spaces between words: `^[A-Za-z]+( [A-Za-z]+)*$` |
| Spaces at the ends | Trimmed before validating and saving, as for Title. Two spaces in a row are rejected |
| Max length | 40 characters after trimming (`PAID_TO_MAX_LENGTH`) |
| Invalid input | The form shows an error and won't submit. Typing isn't blocked, so pasting and editing still work normally |
| After adding | The field clears with Title and Amount. Category and date keep their current behaviour |
| Shown in | Add/Edit form, the expense list, and the Excel export. *Not searchable* |

## Scope

Follow the `add-expense-field` skill; it lists every file.

| Area | Files | Change |
|---|---|---|
| Shared model | `src/app/expenses/expense.model.ts` | `paidTo: string` on `Expense`. `PAID_TO_MAX_LENGTH = 40`, and `isValidPaidTo(value)`, which takes the trimmed value: `''`, or 1–40 characters matching the pattern |
| Database | `api/db.ts` | Column `paid_to TEXT NOT NULL DEFAULT '' CHECK (length(paid_to) <= 40 AND paid_to NOT GLOB '*[^A-Za-z ]*')`. Add it in `migrate(db)` for existing databases, plus `COLUMNS`, INSERT, UPDATE and `ExpenseRow` |
| API | `api/expenses.router.ts` | `parseNewExpense`: a missing or `null` `paidTo` becomes `''`. A non-string gives 400 "Paid to must be text.". An invalid value gives 400 "Paid to can only contain letters and spaces (max 40)." Store the trimmed value |
| Form | `expense-form.component.ts`, `.html` | A `paidTo` control with a validator that uses `isValidPaidTo`, so the form and the API share one rule. It's filled in edit mode and cleared after an add. Errors: "Use letters and single spaces only." and "At most 40 characters." |
| List | `expense-list.component.html` | In the `<small>` line, show `Category · Paid to <name> · date`, only when `paidTo` isn't empty |
| Export | `api/export.ts` | Add a "Paid to" column after Title. `HEADERS` is shared, so the API-only CSV export gets it too |
| Tests | `api/expenses.test.ts`, `expense.service.spec.ts`, `expense-form.component.spec.ts`, `expense-list.component.spec.ts` | Update the fixtures and add the cases below |

## Out of scope

- Searching or filtering by Paid to
- Letters from other alphabets or with accents (é, ñ, देवनागरी), and hyphens or apostrophes ("O'Brien")
- Suggesting or autocompleting earlier names
- Showing Paid to on `/summary`

## Acceptance criteria

### Form

- [x] **AC-1:** Add and Edit show an optional **Paid to** text field with a visible label, after Title.
- [x] **AC-2:** "Big Bazaar", "Ramesh" and an empty field all save.
- [x] **AC-3:** "Shop 24", "Ramesh!", "A&B" and "Big  Bazaar" (two spaces) show "Use letters and single spaces only." and send no request.
- [x] **AC-4:** 41 letters shows "At most 40 characters." and sends no request.
- [x] **AC-5:** "  Ramesh  " saves as "Ramesh".
- [x] **AC-6:** Edit fills in the saved value. After an add, the field is empty again.

### API and database

- [x] **AC-7:** `POST` and `PUT` without `paidTo` save `''`, so older clients keep working.
- [x] **AC-8:** `POST` and `PUT` with digits, symbols, double spaces, more than 40 characters, or a non-string give 400 JSON `{ error }`, and nothing is saved.
- [x] **AC-9:** The value is saved trimmed, and comes back from `GET`.
- [x] **AC-10:** An existing database file gets the `paid_to` column on the next start, and its expenses read back with `paidTo: ''`.
- [x] **AC-11:** The form validator and `parseNewExpense` both use `isValidPaidTo` and `PAID_TO_MAX_LENGTH`. No limit is written in only one place.

### List and export

- [x] **AC-12:** The list shows "Paid to Big Bazaar" in the expense's detail line, and shows nothing extra when the field is empty.
- [x] **AC-13:** The Excel export has a "Paid to" column after Title, empty for expenses without one, and still respects the list's filters.

### Technical

- [x] **AC-14:** No `any`. Nothing new touches `window`, `document` or `localStorage` during render. No new budget warnings.
- [x] **AC-15:** `/run-checks` passes: API types, API tests, Angular tests and the build.

## How to verify

1. **`/run-checks`** for AC-14 and AC-15.
2. **`/verifier-web`:** add one valid and one invalid Paid to in the real form, reload and check it persisted, open Edit, and download the Excel file (AC-1 to AC-6, AC-12, AC-13).
3. **AC-10:** start the built server once on a database file created before this change, and check the column was added.
4. **`expense-reviewer`** against this spec.
