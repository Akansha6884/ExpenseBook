# Summary category filter

**Status:** Implemented and verified (all ACs ticked on 2026-11-16), not committed.

## Overview

Add a **Category** dropdown next to the **Month** dropdown on `/summary`. It opens on **All categories**, so the page looks the same as it does today until someone picks a category.

The two filters work together. For example, Food + November 2026 shows only Food expenses from that month.

- If any expenses match the filters, the tiles and graphs show them.
- If none match, the graphs show "No data available".

## Before starting

- **Failing tests (resolved):** 2 `expense-list` tests failed because they expected an Export CSV link the list no longer shows. The list exports Excel only, so `csvUrl()` was removed and the tests now expect only the Excel link. This is a separate commit from the summary work.

## Scope

All changes stay in `src/app/expenses/summary/`:

- `summary.component.ts`
- `summary.component.html`
- `summary.component.scss`
- `summary.component.spec.ts`

`expense-stats.ts` and `expense.model.ts` are read-only: import from them, but add nothing. The API and database don't change, because Summary already has all the expenses in the browser.

## Implementation

### summary.component.ts

- **Selected category:** `selectedCategory = signal<'all' | ExpenseCategory>('all')`. Narrow the `<select>` value with `EXPENSE_CATEGORIES.find((c) => c === value) ?? 'all'`, so no cast is needed.
- **Three filtered lists:**

  | Computed | Filters by | Feeds |
  |---|---|---|
  | `monthExpenses` | Month only | `categoryTotals()`, so percentages use the whole period |
  | `categoryExpenses` | Category only | `monthlyTotals()` (`months()`, `thisMonth()`) and `selectedStats` |
  | `selectedExpenses` | Both | `noData` |

- **No data:** `noData = selectedExpenses().length === 0`.
- **Tile values:** `categories().find((c) => c.category === selectedCategory())` gives the rounded total, count and percent. Don't sum amounts directly, because `roundToPaise` isn't exported.
- **Old expenses only:** if a category's only expenses are older than the chart window, All time shows 12 empty bars and the tiles still show the total. `noData` stays false, as it already does for All time.

### summary.component.html

- **Filters:** Month and Category as labelled native `<select>`s inside one `.filters` row.
- **Tiles with a category selected:**
  1. "Food total" (All time) or "Food in Nov 2026" (a month)
  2. "This month" (All time) or "Expenses" (a month)
  3. "Share of spending", in place of "Top category"
- **`@else if`:** it can't use `as`, so read `selectedStats()` once with `@let`.
- **By category rows:** reuse the `.selected` and `.dimmed` classes, and add `aria-current="true"` to the selected row.

### summary.component.scss

- **Layout:** `.filters` is a flex row that wraps on narrow screens, replacing the `.month` rule.
- **Dimming:** put the `.dimmed .bar` rule below the `.hbars` block. Both have the same specificity, so otherwise `.hbars .bar` wins and the rows don't dim.
- **Budget:** add as little as possible, and check the build output for budget warnings (2kB warns, 4kB fails).

## Out of scope

- Selecting several categories at once
- Clicking a category row or a bar to filter
- Sharing filters with the expense list (`ExpenseFilterStore`)
- Adding or changing categories
- Exporting from Summary
- Keeping the selection after leaving or refreshing the page

## Acceptance criteria

Ticked means done and tested. Food and November 2026 are the examples.

### Category selector

- [x] **AC-1:** A **Category** dropdown sits next to **Month**, starting on **All categories**.
- [x] **AC-2:** The options are All categories, Food, Travel, Shopping, Bills and Other, in that order, even without expenses.
- [x] **AC-3:** It works with only the keyboard, and screen readers announce its label.
- [x] **AC-4:** It's hidden while loading, after a failed load, and when the user has no expenses. *Covered by the Month dropdown test, since both dropdowns are in the same block.*
- [x] **AC-5:** On narrow screens the two dropdowns wrap, with no horizontal scrolling.

### All categories

- [x] **AC-6:** Every section shows the same values as the month filter does today, for All time and for each month.

### A category with All time

- [x] **AC-7:** First tile: "Food total", all Food spending.
- [x] **AC-8:** Second tile: "This month", this month's Food spending.
- [x] **AC-9:** Third tile: "Share of spending", Food's % of all spending.
- [x] **AC-10:** **Monthly totals** and **Show as table** show only Food, over the same 12 months.
- [x] **AC-11:** **By category** keeps every category and value. Food is highlighted and announced as selected, and the other rows are dimmed in the same blue (`#2a78d6`).

### A category and a month

- [x] **AC-12:** First tile: "Food in Nov 2026", that month's Food spending.
- [x] **AC-13:** Second tile: "Expenses", the number of Food expenses that month.
- [x] **AC-14:** Third tile: Food's % of that month's total.
- [x] **AC-15:** **Monthly totals** shows only Food, with the month highlighted. The window follows the month filter's rules, including moving back for an older month.
- [x] **AC-16:** **By category** lists only that month's categories, with % of that month's total and Food highlighted.
- [x] **AC-17:** An expense's month comes from its stored date, whatever the time zone, and totals are accurate to the paisa.
- [x] **AC-18:** Changing one filter doesn't change the other filter or the Month options.

### No matching expenses

- [x] **AC-19:** If the month has expenses but none in the category, both graphs show "No data available" and **Show as table** is hidden.
- [x] **AC-20:** The same happens with All time for a category with no expenses at all.
- [x] **AC-21:** The tiles show ₹0.00, then 0 (a month) or ₹0.00 (All time), then "—", with no errors.
- [x] **AC-22:** If a category's only expenses are older than the chart window, All time shows 12 empty bars, and the tiles and **By category** still show its data.
- [x] **AC-23:** Picking a combination with data, or **All categories**, brings the graphs back straight away.

### Keeping or resetting the selection

- [x] **AC-24:** Leaving Summary and coming back, or refreshing, resets to **All categories**. Tested through the router.
- [x] **AC-25:** After a real sign-out, the next user on that tab starts on **All categories**.
- [x] **AC-26:** If the category loses its last expense, the page shows "No data available" without errors. If the selected month drops out of the list, Month returns to **All time** and the category stays.

### Technical

- [x] **AC-27:** Changing the category sends no API requests. The API and database are unchanged, and render doesn't touch `window`, `document` or `localStorage`. The code has no `any`, and the build has no new budget warnings.
- [x] **AC-28:** `npm run typecheck:api`, `npm run test:api`, the Angular tests and `npm run build` all pass.
- [x] **AC-29:** `summary.component.spec.ts` covers AC-2, AC-6 to AC-16, AC-18 to AC-26, and the dimmed colour.
- [x] **AC-30:** The only files changed are in `src/app/expenses/summary/`. The Excel-only export fix in `expense-list` is committed separately, so the summary commit still contains only `summary/` files.

## How to verify

1. **`/run-checks`:** type-check, API tests, Angular tests and build (AC-27, AC-28). To run only this spec's tests: `npx ng test --include src/app/expenses/summary/summary.component.spec.ts --watch=false --browsers=ChromeHeadless`
2. **`/verifier-web`:** AC-3 (keyboard and screen reader label) and AC-5 (narrow screen).
3. **`expense-reviewer`:** review the changes against this spec.
