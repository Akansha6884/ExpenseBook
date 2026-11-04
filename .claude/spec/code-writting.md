# Summary month filter

## Overview

Add a **Month** dropdown filter to the top of `/summary`. It opens on **All time**, so the page looks the same as it does today until someone picks a month.

- If the selected month has data, the tiles and graphs show it.
- If the selected month has no data, the graphs show "No data available".

## Scope

All changes stay in `src/app/expenses/summary/`:

- `summary.component.ts`
- `summary.component.html`
- `summary.component.scss`
- `summary.component.spec.ts`

`expense-stats.ts` is read-only: its existing functions can be imported, but nothing is added to it. The API and database don't change, because Summary already has all the expenses in the browser.

## Decisions

| Topic | Decision |
|---|---|
| Default view | All time |
| Control | Labelled native `<select>` |
| Dropdown options | All time, then every month from the latest to the oldest expense's month, including months without expenses |
| Latest month | The current month, or the latest expense's month if that's later |
| Selection state | Local signal in `SummaryComponent`, which resets to All time when the user leaves the page or refreshes it |

## Behaviour

| Section | All time | Month with data | Month without data |
|---|---|---|---|
| First tile | Total spent | That month's total, labelled "Spent in Nov 2026" | ₹0.00 |
| Second tile | This month | "Expenses": the number of expenses in that month | 0 |
| Third tile | Top category overall | Top category for that month | "—" |
| Monthly totals | Last 12 months | 12-month chart with the selected bar highlighted | "No data available" |
| Show as table | Available | Available | Hidden |
| By category | All expenses | That month only | "No data available" |

## Implementation notes

- **Selected month:** keep it in a local signal, with `'all'` meaning All time.
- **Month options:** use a computed value that steps back from the latest month with `shiftMonth`.
- **Filtering:** compare `e.date.slice(0, 7)` with the selected month, so time zones can't move an expense into the wrong month.
- **Month totals:** `monthlyTotals(expenses, month, 1)` returns the month's total and count.
- **Categories:** pass the filtered expenses to `categoryTotals()`.
- **Chart window:** end at the latest month, unless the selected month is older than the window. In that case, end at the selected month.
- **Highlighting:** dim the other bars instead of adding a new colour, so the chart keeps its single blue (`#2a78d6`).
- **Top category tile:** handle an empty list. The template currently reads `categories()[0].category` directly, which would crash for a month without data.
- **Styles:** add as little as possible to `summary.component.scss`. Component styles warn at 2kB and error at 4kB, and nothing can move to `src/styles.scss`.

## Out of scope

- Clicking a bar to select its month
- Comparing with the previous month
- Custom date ranges
- Exporting from Summary
- Keeping the selection after leaving or refreshing the page

## Acceptance criteria

### Month selector

- **AC-1:** When a signed-in user with expenses opens `/summary`, a dropdown labelled **Month** is shown with **All time** selected.
- **AC-2:** The options are **All time**, then every month from the latest to the oldest expense's month, newest first, in the format "November 2026". The latest month is the current month, or the latest expense's month if that's later.
- **AC-3:** Months without expenses are included in the list, and the same month in different years is kept separate (for example, March 2025 and March 2026).
- **AC-4:** The dropdown can be used with only the keyboard, and screen readers announce its label.
- **AC-5:** The dropdown isn't shown while loading, after a failed load, or when the user has no expenses at all. Those messages stay as they are today.

### All time view

- **AC-6:** With **All time** selected, the tiles, chart and category section show the same values as they do today.

### Selecting a month with data

- **AC-7:** The first tile shows that month's total, labelled with the month (for example, "Spent in Nov 2026").
- **AC-8:** The second tile shows the number of expenses in that month, labelled "Expenses", in place of "This month".
- **AC-9:** The third tile shows the highest-spend category for that month.
- **AC-10:** **By category** lists only that month's categories, largest first, with percentages based on that month's total.
- **AC-11:** An expense counts towards a month based on its stored date, including the first and last day of the month, regardless of time zone.
- **AC-12:** Totals are accurate to the paisa, with no rounding errors (for example, ₹0.10 + ₹0.20 shows as ₹0.30).
- **AC-13:** If the selected month is within the current 12-month window, the chart keeps that window and its bar values don't change.
- **AC-14:** If the selected month is older than the window, the chart shows the 12 months ending at that month, and the caption's date range updates.
- **AC-15:** The selected bar stands out and the others are dimmed, all in the existing blue (`#2a78d6`), and screen readers announce the bar as selected.
- **AC-16:** Tooltips and **Show as table** still work, and show the same 12 months as the chart.

### Selecting a month without data

- **AC-17:** **Monthly totals** shows "No data available" in place of the bars and **Show as table**.
- **AC-18:** **By category** also shows "No data available" in place of its bars.
- **AC-19:** The tiles show ₹0.00, 0 expenses and "—" for the top category, and the page has no errors.
- **AC-20:** Selecting a month with data, or **All time**, brings the graphs back straight away.

### Keeping or resetting the selection

- **AC-21:** Leaving Summary and coming back, or refreshing the page, resets the selection to **All time**.
- **AC-22:** After signing out, the next user on that tab starts on **All time**.
- **AC-23:** If the selected month loses its data while Summary is open, it shows "No data available". If that month is no longer in the list at all, the page returns to **All time** without errors.
- **AC-24:** A month added from another page appears in the dropdown when you return to Summary.

### Technical

- **AC-25:** Changing the month sends no API requests, and the API and database are unchanged.
- **AC-26:** Prerendering and page load work as they do today, with no `window`, `document` or `localStorage` access during render.
- **AC-27:** The new code uses no `any`, and the production build has no new budget errors or warnings.
- **AC-28:** Tests in `summary.component.spec.ts` cover AC-2, AC-3, AC-6 to AC-10, AC-14 and AC-17 to AC-23.
- **AC-29:** `npm run typecheck:api`, `npm run test:api`, the Angular tests and `npm run build` all pass.
- **AC-30:** The only files changed are in `src/app/expenses/summary/`.
