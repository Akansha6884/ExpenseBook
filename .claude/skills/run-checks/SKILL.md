---
name: run-checks
description: Run every check for the expense book project (API type-check, API tests, Angular unit tests, production build) and report the results. Use after any code change, before committing, or when the user asks to "run the checks", "run the tests" or "check the build". For checking the running app in a browser, use verifier-web instead.
---

# Verify the project

Run these from the project root, in this order. Run all of them even if an earlier one fails, so the report is complete.

| # | Check | Command | Pass looks like |
|---|---|---|---|
| 1 | API types | `npm run typecheck:api` | No output after the `tsc` line |
| 2 | API tests | `npm run test:api` | `# fail 0` |
| 3 | Angular tests | `npx ng test --watch=false --browsers=ChromeHeadless` | `TOTAL: N SUCCESS` |
| 4 | Production build | `npx ng build` | `Application bundle generation complete` with no `WARNING` or `ERROR` lines |

To keep Karma output readable, strip ANSI codes and stack frames:

```bash
npx ng test --watch=false --browsers=ChromeHeadless 2>&1 | sed 's/\x1b\[[0-9;]*m//g; s/\x1b\[1A//g; s/\x1b\[2K//g' | grep -vE '^\s+at ' | grep -E 'FAILED|Expected|Error|TOTAL'
```

## Also check

- **No `any`**: `grep -rnE ':\s*any\b|<any>|as any' src api server.ts --include=*.ts`. Any hit breaks the CLAUDE.md rule; fix it with a proper type or `unknown`.
- **Focused tests left behind**: `grep -rnE '\b(fdescribe|fit)\(' src`. These silently skip all other tests.
- **Stray debugger statements**: `grep -rn 'debugger' src api`.

## Report

Give a short table: each check, pass or fail, and counts (for example `35/35`). For any failure, quote the failing test name and the `Expected ...` line, and say which file it points to. Don't claim a pass for a check you didn't run.

## Notes

- None of these need the dev server or the API to be running. Angular tests fake HTTP, and API tests use in-memory SQLite.
- If the build fails with `NG0210 ... document is not available`, check that `src/main.server.ts` still passes `context` to `bootstrapApplication` (see CLAUDE.md).
