# Plan: finish the summary category filter

**Spec:** [summary-category-filter.md](../spec/summary-category-filter.md). The feature is built in `src/app/expenses/summary/` and not committed. All 153 Angular tests pass.

## Steps

- [x] **1. Fix the failing export tests.** The list now offers only Excel export: `csvUrl()` is removed and the tests are updated. The API's `/export.csv` endpoint is unchanged.
- [x] **2. Run every check** with `/run-checks`. Covers AC-27 and AC-28. *Passed on 2026-11-16: API types, API tests 49/49, Angular 153/153, build with no budget warnings.*
- [x] **3. Check in a real browser** with `/verifier-web`. Covers AC-3 (keyboard use and the "Category" label) and AC-5 (at 360px wide the dropdowns wrap, with no horizontal scroll). *Passed in Edge on 2026-11-16, along with AC-19, AC-23 and no API calls while filtering. Below 320px the app's top nav overflows on every page; that's outside this feature.*
- [x] **4. Review** with the `expense-reviewer` agent. *"Looks good" on 2026-11-16: no code bugs. The out-of-date spec notes are fixed. A small optional gap: AC-17 has no boundary test for a category combined with a month.*
- [ ] **5. Commit in separate pieces** (AC-30), then set the spec's Status to "Done":
  - Summary filter: `src/app/expenses/summary/*` and the spec
  - Excel-only export: `src/app/expenses/expense-list/*`
  - `/auth/me` returns `null` when signed out: `api/auth.router.ts`, `api/expenses.test.ts`, `src/app/auth/auth.service*.ts`
