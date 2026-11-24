# Plan: hide empty months in the Monthly totals table

**Spec:** `.claude/spec/hide-empty-months.md` (AC-1 to AC-7)

## Context

On `/summary`, **Show as table** under **Monthly totals** lists all 12 months of the chart window, including months with ₹0.00 and 0 expenses. You want the table to list only months with spending, while the bar chart keeps all 12 months so the time axis stays even.

The table and the chart both read `months()` (`monthlyTotals(...)` in `src/app/expenses/expense-stats.ts`, which pads empty months with `{ total: 0, count: 0 }`). So the change is to give the table its own filtered list and leave `months()` and the chart alone.

## Changes

All in `src/app/expenses/summary/`. `expense-stats.ts`, the API and the database don't change.

### 1. `summary.component.ts`
Add one computed next to `months` (line 87):
```ts
/** The table lists only months with spending; the chart keeps all 12. */
readonly tableMonths = computed(() => this.months().filter((m) => m.count > 0));
```
"Empty" means `count === 0`, as the spec says. `MonthTotal.count` already exists.

### 2. `summary.component.html`
Inside `<details>`, after `<summary>Show as table</summary>`:
```html
@if (tableMonths().length === 0) {
  <p class="empty-table">No spending in these months</p>
} @else {
  <table> … @for (m of tableMonths(); track m.month) { … } … </table>
}
```
- The chart's `@for (m of months(); …)` stays as it is (AC-3).
- The `@if (noData())` that already hides the whole section is unchanged (AC-6).
- The message gets no `.muted` class. Several tests read `texts('.card .muted')` and expect exactly the two "No data available" lines, so an extra `.muted` element could break them. No SCSS change, which also keeps the style budget untouched.

### 3. `summary.component.spec.ts`
Update the 4 tests that expect 12 table rows. The test data has spending in `thisMonth` and `lastMonth`, and `book` adds `oldMonth`:

| Test (line) | Data | New expectation |
|---|---|---|
| "offers the monthly numbers as a table" (168) | `expenses` | 2 rows. The last row has ₹900.00, and no row has ₹0.00 |
| "keeps the tooltips and table for all 12 months" (323) | `book`, month = `lastMonth` | Tooltips stay at 12. The table has 3 rows. Rename to "…tooltips for all 12 months, and the table for months with spending" |
| "moves the window back…" (371) | `book` + an expense 20 months back | 1 row, for that older month |
| "charts only that category…" (564), Food, All time | `book` | 2 rows, the last with ₹600.00. Drop the `rows[8]` ₹0.00 assertion, since that row no longer exists |

Add assertions and tests:
- **AC-2:** in the 168 test, rows are oldest to newest (`lastMonth` before `thisMonth`) and show the same totals and counts as the chart tooltips.
- **AC-5:** in "shows empty bars when the category only has expenses older than the chart" (697), the table has no rows, `.empty-table` says "No spending in these months", and the chart still has 12 bars.
- **AC-4:** a month and a category together (for example `lastMonth` + Food) list only months with Food spending.
- **AC-6:** already covered by the "No data available" tests (387, 661, 673), which check that `details` is null. No change needed.

## Verification

1. Focused run: `npx ng test --include src/app/expenses/summary/summary.component.spec.ts --watch=false --browsers=ChromeHeadless`
2. `/run-checks`: API type-check, API tests, all Angular tests, and the build with no budget warnings (AC-7)
3. `/verifier-web`: with expenses in 2–3 months, open **Show as table** on `/summary`. Empty months are missing from the table, the chart still has 12 bars, and Food + All time lists only Food months.
4. Tick AC-1 to AC-7 in the spec, and set its Status.

## Notes

- This plan file was saved to `~/.claude/plans/`, not the project's `.claude/plans/`, so the `plansDirectory` setting didn't take effect in this session. After approval I'll copy it to `.claude/plans/hide-empty-months.md` so it sits next to the other plans.
- The half-applied nav-tab fix (`app.component.*`) is unrelated and stays out of this change.
