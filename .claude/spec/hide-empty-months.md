# Hide empty months in the Monthly totals table

**Status:** Implemented and verified (2026-11-23), not committed.

## Overview

On `/summary`, the **Show as table** view under **Monthly totals** lists only months that have spending. Months with no expenses (₹0.00, 0 expenses) are left out. The bar chart still shows all 12 months, including empty ones.

## Decisions

| Topic | Decision |
|---|---|
| What counts as empty | A month whose `count` is 0, which also means its total is ₹0.00 |
| Bar chart | Unchanged: always 12 months |
| Order | Oldest to newest, as today |
| Every month empty | The table shows "No spending in these months", not an empty table |

## Scope

All changes stay in `src/app/expenses/summary/`:

- `summary.component.ts`: a `tableMonths` computed: `months()` filtered to `count > 0`
- `summary.component.html`: the table loops over `tableMonths()`, with the empty message when there are none
- `summary.component.spec.ts`: tests for the acceptance criteria below

`expense-stats.ts`, the API and the database don't change.

## Out of scope

- Hiding empty months in the bar chart
- Hiding empty rows in the **By category** section
- A setting to show or hide empty months

## Acceptance criteria

- [x] **AC-1:** A month with a total of ₹0.00 doesn't appear in the table.
- [x] **AC-2:** Months with spending still appear, in the same order (oldest to newest) and with the same values.
- [x] **AC-3:** The bar chart is unchanged: it still shows 12 months, including empty ones.
- [x] **AC-4:** This works with every Month and Category filter combination. For example, Food + All time lists only months with Food spending.
- [x] **AC-5:** If every month in the chart's 12-month range is ₹0, the table shows "No spending in these months", not an empty table. This can happen when a category's only expenses are older than the range.
- [x] **AC-6:** When the filters match nothing, "No data available" and the hidden **Show as table** link behave as today.
- [x] **AC-7:** `/run-checks` passes, with no `any` and no new budget warnings.

## How to verify

1. **`/run-checks`** for AC-7.
2. **`/verifier-web`:** open **Show as table** with a few months of data, and check that empty months are missing from the table but still show in the chart (AC-1 to AC-3).
