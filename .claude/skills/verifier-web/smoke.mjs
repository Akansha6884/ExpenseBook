// Usage: node smoke.mjs <baseUrl> <screenshotDir>
// Needs playwright-core installed next to this file (see SKILL.md). Uses Edge.
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:4122';
const SHOTS = process.argv[3] ?? '.';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
const api = [];
page.on('response', (r) => { if (r.url().includes('/api/')) api.push(`${r.request().method()} ${new URL(r.url()).pathname} -> ${r.status()}`); });

const texts = (sel) => page.locator(sel).allInnerTexts();
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const field = (name) => `[formcontrolname=${name}]`;

async function addExpense(title, amount, category) {
  await page.fill(field('title'), title);
  await page.fill(field('amount'), amount);
  if (category) await page.selectOption(field('category'), category);
  await page.click('button[type=submit]');
}

// Every page needs an account; each browser context is a separate user.
async function signUp(p) {
  await p.goto(BASE + '/signup');
  await p.waitForSelector('h2:has-text("Create your account")');
  await p.fill('input[type=email]', `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`);
  await p.fill('input[type=password]', 'smoke-password');
  await p.click('button[type=submit]');
  await p.waitForURL('**/expenses');
}

// Empty state
await signUp(page);
await page.goto(BASE + '/');
await page.waitForSelector('.empty:not(:has-text("Loading"))');
log('empty state:', new URL(page.url()).pathname, await texts('.empty'));
await shot('01-empty');

// Add page: validation probes
await page.click('nav a:has-text("Add Expense")');
await page.waitForSelector('form');
log('amount field initially:', JSON.stringify(await page.inputValue(field('amount'))));
await page.click('button[type=submit]');
// eventCoalescing defers rendering to the next frame: wait, don't read right after a click.
await page.waitForSelector('.error');
log('empty submit errors:', await texts('.error'));
await addExpense('    ', '5');
log('spaces-only title errors:', await texts('.error'), '| banner:', await page.locator('.error-banner').count());
await addExpense('Odd', '10.555');
log('3-decimal amount errors:', await texts('.error'));

// Add two valid expenses
await addExpense('  Groceries  ', '1200.50', 'Food');
await page.waitForSelector('.success:has-text("Groceries")');
log('after add:', await texts('.success'), '| amount field now:', JSON.stringify(await page.inputValue(field('amount'))));
await addExpense('Train ticket', '300', 'Travel');
await page.waitForSelector('.success:has-text("Train ticket")');

// List
await page.click('.success a');
await page.waitForSelector('li');
log('rows:', await texts('li strong'), '| total:', await texts('.total'));
await shot('02-list');

// Edit
await page.locator('li').first().locator('a:has-text("Edit")').click();
await page.waitForSelector('h2:has-text("Edit Expense")');
log('edit prefilled:', await page.inputValue(field('title')), await page.inputValue(field('amount')));
await page.fill(field('title'), 'Train ticket (return)');
await page.fill(field('amount'), '550');
await page.click('button[type=submit]');
await page.waitForURL('**/expenses');
await page.waitForSelector('li');
log('after edit:', await texts('li strong'), '| total:', await texts('.total'));

// Persistence
await page.reload();
await page.waitForSelector('li');
log('after reload:', await texts('li strong'));

// Unknown id
await page.goto(BASE + '/edit/does-not-exist');
await page.waitForSelector('.empty');
log('unknown id:', await texts('.empty'));

// Delete: cancel, then accept
await page.goto(BASE + '/expenses');
await page.waitForSelector('li');
page.once('dialog', (d) => d.dismiss());
await page.locator('li').first().locator('button:has-text("Delete")').click();
await page.waitForTimeout(300);
log('after cancelled delete, rows:', await page.locator('li').count());
page.once('dialog', (d) => d.accept());
await page.locator('li').first().locator('button:has-text("Delete")').click();
await page.waitForFunction(() => document.querySelectorAll('li').length === 1);
log('after delete:', await texts('li strong'), '| total:', await texts('.total'));

// API unreachable while adding
await page.click('nav a:has-text("Add Expense")');
await page.waitForSelector('form');
await page.route('**/api/**', (r) => r.abort('connectionrefused'));
await addExpense('Offline item', '99');
await page.waitForSelector('.error-banner');
log('API down banner:', await texts('.error-banner span'));
await page.click('.error-banner .dismiss');
await page.waitForSelector('.error-banner', { state: 'detached' });
log('banner after dismiss:', await page.locator('.error-banner').count());
await page.unroute('**/api/**');

// First load fails
await page.route('**/api/**', (r) => r.fulfill({ status: 500, body: 'boom' }));
await page.goto(BASE + '/expenses');
await page.waitForSelector('.error-banner');
log('load failure list:', await texts('.card .empty'));
await shot('03-load-failed');
await page.unroute('**/api/**');
await page.click('.card .empty button:has-text("Retry")');
await page.waitForSelector('li');
log('after retry rows:', await texts('li strong'));

// Early-morning default date (02:00 IST)
const ctx = await browser.newContext({ timezoneId: 'Asia/Kolkata' });
const early = await ctx.newPage();
await signUp(early);
await early.clock.setFixedTime(new Date('2026-10-28T20:30:00Z'));
await early.goto(BASE + '/add');
await early.waitForSelector('form');
log('02:00 IST default date:', await early.inputValue(field('date')), '(expect 2026-10-29)');
await ctx.close();

log('\nAPI calls:\n  ' + api.join('\n  '));
log('\nConsole problems:\n  ' + (problems.join('\n  ') || '(none)'));
await browser.close();
