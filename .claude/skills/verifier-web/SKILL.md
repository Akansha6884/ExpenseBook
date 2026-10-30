---
name: verifier-web
description: Verify the expense book app end to end by running the real built server against a throwaway SQLite database and driving it in a headless browser (Playwright + Edge) — clicking, typing, screenshots. Use when asked to verify a change in the running app, check a UI or API behaviour for real, or reproduce a bug a user reported.
---

# Verify in the running app

Drives the **production build** (`dist/.../server.mjs`), which serves the pages and the API in one process. It never touches the user's real `data/expense-book.db`.

## 1. Build

```bash
npx ng build
```

## 2. Start an isolated server

Pick a free port (not 3000 or 4200, which the user's own `npm run dev` uses) and a throwaway DB in the scratchpad:

```bash
DB_PATH="<scratchpad>/verify.db" PORT=4122 node dist/expense-book/server/server.mjs   # run in background
```

Wait until `curl -s localhost:4122/api/auth/me` returns `401` JSON. Every page except `/login` and `/signup` needs a signed-in user: sign up through the UI first (each Playwright `newContext()` is a separate user with its own cookie).

## 3. Get a browser

- Chrome is **not** installed system-wide here; use **Edge**: `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`.
- Install `playwright-core` (no browser download) into a **scratchpad** folder, never into the project:
  ```bash
  mkdir -p "<scratchpad>/pw" && cd "<scratchpad>/pw" && npm init -y && npm install playwright-core@1.48.2
  ```
- Copy `smoke.mjs` from this skill folder there and run it:
  ```bash
  node smoke.mjs http://localhost:4122 "<scratchpad>/shots"
  ```

`smoke.mjs` walks the main flow (empty state → add → list → edit → reload → delete) plus the probes that found real bugs before, and prints each step, every `/api` call with its status, and any console errors. Extend it, or write a focused script next to it, for whatever the change touches.

## 4. Flows worth driving

- **Add**: empty submit shows field errors and sends nothing; a title of only spaces must show a field error (not a banner); `10.555` must be rejected; the amount field is blank (not `0`) after adding.
- **Edit**: open `/edit/<id>` both by clicking and by direct URL (SSR + hydration + the form-filling `effect`); `/edit/does-not-exist` shows "doesn't exist".
- **Delete**: cancel the `confirm()` dialog (nothing sent), then accept it.
- **Persistence**: reload the page; the data must come back from SQLite.
- **Failures**: `page.route('**/api/**', r => r.abort('connectionrefused'))` → banner says "Is the API running?"; `r.fulfill({ status: 500 })` on first load → list shows "Couldn't load your expenses" with **Retry**, not "No expenses yet".
- **Early-morning date**: `newContext({ timezoneId: 'Asia/Kolkata' })` + `page.clock.setFixedTime(new Date('2026-10-28T20:30:00Z'))` → default date must be **2026-10-29**.
- **Accounts**: signed-out `/expenses` → `/login`; a second account sees an empty book and gets `404` for the first account's ids; clearing cookies then clicking Delete → `/login` with no banner. To test the first-account claim, seed `DB_PATH` with the old schema (expenses without `user_id`) before starting.
- **Export**: `page.waitForEvent('download')` around clicking Export CSV / Excel; the filtered list must give a filtered file.
- **API directly** (curl): malformed JSON → JSON `400`, not an HTML stack trace; oversized body → JSON `413`.

## 5. Look at the screenshots

Read the PNGs in `<scratchpad>/shots` — layout problems don't show up in text output.

## 6. Clean up

Stop the server (TaskStop, then kill whatever still listens on the port — on Windows the child `node` process survives), and delete `<scratchpad>/verify.db*`. Leave the user's own servers on 3000/4200 alone.

## Gotchas

- `ng serve` (Angular 18) does **not** run `server.ts`; only the built server has the API in-process. With `ng serve` you'd also need `npm run api` on port 3000.
- Hydration: data loads after `/api/auth/me` answers, so always wait for content (`waitForSelector('li')`), never just for `load`.
- `eventCoalescing: true` delays rendering after a click to the next animation frame. Reading the DOM right after `click()` can show the **old** state — always `waitForSelector(...)` (or `{ state: 'detached' }`) for the expected result before asserting.
- `/expenses` without a trailing slash returns `301` from the static file server (prerendered folder) — follow redirects with `curl -L`.
