---
name: new-page
description: Add a new routed page or screen to the expense book app (for example a monthly summary, category report or settings page), including the route, nav link, data access and tests. Use when the user asks for a new page, screen, view, tab or route.
---

# Add a new page

## 1. Generate the component

```bash
npx ng generate component expenses/<name> --skip-tests
```

This gives a standalone component with SCSS. Write the spec yourself in step 6, following the existing specs. Match the existing components:
- `inject()` for dependencies, not constructor parameters
- `readonly` signal fields that the template calls, like `expenses()` and `total()`
- Angular control flow (`@if`, `@for ... track`), not `*ngIf` / `*ngFor`
- Wrap the page content in `<section class="card">` with an `<h2>` title. `.card`, `.btn-primary`, `.btn-secondary` and `.btn-danger` are global styles in `src/styles.scss`.

## 2. Add the route: `src/app/app.routes.ts`

- Add it **before** the `'**'` catch-all, or it will never match.
- Give it a tab `title` in the form `'<Page> · Expense Book'`.
- Route parameters (`:id`) arrive as a signal `input()` with the same name, via `withComponentInputBinding()`. See `ExpenseFormComponent.id`.
- Pages without parameters are prerendered at build time. Pages with parameters aren't.

## 3. Add a nav link: `src/app/app.component.html`

```html
<a routerLink="/<path>" routerLinkActive="active">Label</a>
```

Skip this for pages reached from inside another page, like `/edit/:id`.

## 4. Get data only through `ExpenseService`

- Read `expenses()`, `total()`, `loaded()` and `error()`. Derive page-specific values with `computed()` inside the component, for example totals by category.
- Show "Loading…" while `!loaded()`. The server render and first client render happen before data arrives.
- Never call `HttpClient`, `localStorage`, `window` or `document` directly from a component. SSR and prerendering run components in Node.
- If the page needs new server data, add a method to `ExpenseService`, plus a matching route in `api/expenses.router.ts` and a query in `api/db.ts`, each with tests.

## 5. Styles

Keep component SCSS small: the production build **fails above 4kB** per component and warns above 2kB. Move anything reusable to `src/styles.scss`.

## 6. Tests

Write `<name>.component.spec.ts` following `expense-list.component.spec.ts`:
- providers: `provideRouter([])`, `provideHttpClient()`, `provideHttpClientTesting()`
- trigger the initial load with `fixture.detectChanges(); await signIn(http);` (`src/app/testing/sign-in.ts`), and `await settle()` after each `flush` before `fixture.whenStable()`
- answer it with `http.expectOne({ method: 'GET', url: EXPENSES_API }).flush(data)`, then `await fixture.whenStable(); fixture.detectChanges();`
- `afterEach(() => http.verify())`

Cover: the loading state, the empty state, rendering with data, and each user action.

## 7. Verify

Run the `run-checks` skill. The build log should list the new page under "Prerendered N static routes" if it has no parameters.
