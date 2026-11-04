import { formatDate } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AUTH_API, AuthService } from '../../auth/auth.service';
import { Expense } from '../expense.model';
import { EXPENSES_API, ExpenseService } from '../expense.service';
import { monthKeyOf, shiftMonth } from '../expense-stats';
import { SummaryComponent } from './summary.component';
import { settle, signIn } from '../../testing/sign-in';

const thisMonth = monthKeyOf(new Date());
const lastMonth = shiftMonth(thisMonth, -1);

const expenses: Expense[] = [
  { id: 'a', title: 'Groceries', amount: 600, category: 'Food', date: `${thisMonth}-01` },
  { id: 'b', title: 'Train', amount: 300, category: 'Travel', date: `${thisMonth}-02` },
  { id: 'c', title: 'Rent', amount: 1000, category: 'Bills', date: `${lastMonth}-05` },
  { id: 'd', title: 'Snacks', amount: 100, category: 'Food', date: `${lastMonth}-06` }
];

describe('SummaryComponent', () => {
  let fixture: ComponentFixture<SummaryComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;

  function render(): void {
    fixture = TestBed.createComponent(SummaryComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  async function create(): Promise<void> {
    render();
    await signIn(http);
  }

  async function respondWith(list: Expense[]): Promise<void> {
    http.expectOne({ method: 'GET', url: EXPENSES_API }).flush(list);
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function texts(selector: string): string[] {
    return Array.from(el.querySelectorAll(selector)).map((n) => n.textContent?.trim() ?? '');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SummaryComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shows a loading message until the API responds', async () => {
    await create();
    fixture.detectChanges();
    expect(el.textContent).toContain('Loading…');

    await respondWith([]);
    expect(el.textContent).not.toContain('Loading…');
  });

  it('shows an empty state linking to the add page', async () => {
    await create();
    await respondWith([]);

    expect(el.textContent).toContain('No expenses yet.');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/add');
  });

  it('shows Retry when loading fails, and recovers', async () => {
    await create();
    http.expectOne(EXPENSES_API).flush('down', { status: 500, statusText: 'Server Error' });
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).toContain("Couldn't load your expenses.");

    el.querySelector<HTMLButtonElement>('button')?.click();
    await respondWith(expenses);
    expect(el.querySelector('.tiles')).not.toBeNull();
  });

  describe('with expenses', () => {
    beforeEach(async () => {
      await create();
      await respondWith(expenses);
    });

    it('shows total, this month and top category tiles', () => {
      expect(texts('.tile .value')).toEqual(['₹2,000.00', '₹900.00', 'Bills']);
    });

    it('draws 12 month columns ending this month, scaled to the largest month', () => {
      const columns = Array.from(el.querySelectorAll<HTMLElement>('.column'));
      const heights = columns.map((c) => c.querySelector<HTMLElement>('.bar')?.style.height);

      expect(columns.length).toBe(12);
      expect(heights[11]).toBe('81.8182%'); // 900 / 1100
      expect(heights[10]).toBe('100%'); // 1100, the largest
      expect(heights[0]).toBe('0%');
    });

    it('labels only the largest column and gives every column an accessible label', () => {
      expect(texts('.cap')).toEqual(['₹1,100']);
      const label = el.querySelectorAll('.column')[11].getAttribute('aria-label');
      expect(label).toContain('₹900.00 (2)');
    });

    it('offers the monthly numbers as a table', () => {
      const rows = el.querySelectorAll('details tbody tr');
      expect(rows.length).toBe(12);
      expect(rows[11].textContent).toContain('₹900.00');
    });

    it('lists categories largest first with share of total', () => {
      expect(texts('.hbars .name')).toEqual(['Bills', 'Food', 'Travel']);
      expect(texts('.hbars .amount')).toEqual(['₹1,000.00 50%', '₹700.00 35%', '₹300.00 15%']);
      const widths = Array.from(el.querySelectorAll<HTMLElement>('.hbars .bar')).map((b) => b.style.width);
      expect(widths).toEqual(['100%', '70%', '30%']);
    });
  });

  describe('month filter', () => {
    const emptyMonth = shiftMonth(thisMonth, -2);
    const oldMonth = shiftMonth(thisMonth, -3);
    const book: Expense[] = [
      ...expenses,
      { id: 'e', title: 'Bus', amount: 50, category: 'Travel', date: `${oldMonth}-15` }
    ];

    function select(): HTMLSelectElement {
      return el.querySelector('select') as HTMLSelectElement;
    }

    function selectMonth(value: string): void {
      select().value = value;
      select().dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }

    function monthName(month: string, format: string): string {
      return formatDate(`${month}-01`, format, 'en-US');
    }

    function barHeights(): (string | undefined)[] {
      return Array.from(el.querySelectorAll<HTMLElement>('.column .bar')).map((b) => b.style.height);
    }

    async function removeExpense(id: string): Promise<void> {
      const removed = TestBed.inject(ExpenseService).remove(id);
      http.expectOne({ method: 'DELETE', url: `${EXPENSES_API}/${id}` }).flush(null, { status: 204, statusText: 'No Content' });
      await removed;
      fixture.detectChanges();
    }

    async function open(list: Expense[]): Promise<void> {
      await create();
      await respondWith(list);
    }

    describe('dropdown', () => {
      it('is labelled Month and starts on All time', async () => {
        await open(book);

        expect(select().closest('label')?.textContent).toContain('Month');
        expect(select().value).toBe('all');
        expect(select().selectedOptions[0].textContent).toBe('All time');
      });

      it('lists every month from the latest to the oldest expense, newest first', async () => {
        const future = shiftMonth(thisMonth, 2);
        await open([...book, { id: 'f', title: 'Trip', amount: 10, category: 'Travel', date: `${future}-20` }]);

        const values = Array.from(select().options).map((o) => o.value);
        expect(values).toEqual([
          'all',
          future,
          shiftMonth(thisMonth, 1),
          thisMonth,
          lastMonth,
          emptyMonth,
          oldMonth
        ]);
      });

      it('ends at the current month when every expense is older', async () => {
        await open([{ id: 'a', title: 'Old', amount: 5, category: 'Food', date: `${lastMonth}-01` }]);

        expect(Array.from(select().options).map((o) => o.value)).toEqual(['all', thisMonth, lastMonth]);
      });

      it('keeps the same month in different years apart, in the long format', async () => {
        await open([
          { id: 'a', title: 'New', amount: 5, category: 'Food', date: '2026-03-10' },
          { id: 'b', title: 'Old', amount: 5, category: 'Food', date: '2025-03-10' }
        ]);

        const names = Array.from(select().options).map((o) => o.textContent);
        expect(names).toContain('March 2026');
        expect(names).toContain('March 2025');
        expect(names[names.length - 1]).toBe('March 2025');
      });

      it('is hidden while loading, after a failed load, and with no expenses', async () => {
        await create();
        fixture.detectChanges();
        expect(select()).toBeNull();

        http.expectOne(EXPENSES_API).flush('down', { status: 500, statusText: 'Server Error' });
        await settle();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(select()).toBeNull();

        el.querySelector<HTMLButtonElement>('button')?.click();
        await respondWith([]);
        expect(el.textContent).toContain('No expenses yet.');
        expect(select()).toBeNull();
      });

      it('adds a new month while the page is open', async () => {
        await open(book);
        const future = shiftMonth(thisMonth, 1);

        const added = TestBed.inject(ExpenseService).add({ title: 'Trip', amount: 10, category: 'Travel', date: `${future}-01` });
        http.expectOne({ method: 'POST', url: EXPENSES_API }).flush({
          id: 'n',
          title: 'Trip',
          amount: 10,
          category: 'Travel',
          date: `${future}-01`
        });
        await added;
        fixture.detectChanges();

        expect(select().options[1].value).toBe(future);
      });
    });

    describe('All time', () => {
      it('shows the same tiles as before a month is picked', async () => {
        await open(book);
        const values = ['₹2,050.00', '₹900.00', 'Bills'];

        expect(texts('.tile .label')).toEqual(['Total spent', 'This month', 'Top category']);
        expect(texts('.tile .value')).toEqual(values);

        selectMonth(lastMonth);
        selectMonth('all');

        expect(texts('.tile .label')).toEqual(['Total spent', 'This month', 'Top category']);
        expect(texts('.tile .value')).toEqual(values);
        expect(el.querySelectorAll('.selected, .dimmed').length).toBe(0);
      });
    });

    describe('a month with data', () => {
      beforeEach(async () => {
        await open(book);
      });

      it('shows that month in the tiles', () => {
        selectMonth(lastMonth);

        expect(texts('.tile .label')).toEqual([`Spent in ${monthName(lastMonth, 'MMM yyyy')}`, 'Expenses', 'Top category']);
        expect(texts('.tile .value')).toEqual(['₹1,100.00', '2', 'Bills']);
      });

      it('lists only that month in By category, with percentages of its total', () => {
        selectMonth(lastMonth);

        expect(texts('.hbars .name')).toEqual(['Bills', 'Food']);
        expect(texts('.hbars .amount')).toEqual(['₹1,000.00 91%', '₹100.00 9%']);
      });

      it('keeps the 12-month window when the month is inside it', () => {
        const heights = barHeights();
        const caption = texts('.caption');

        selectMonth(oldMonth);

        expect(barHeights()).toEqual(heights);
        expect(texts('.caption')).toEqual(caption);
        expect(caption[0]).toContain('Last 12 months');
      });

      it('highlights the selected bar in the same blue and dims the others', () => {
        selectMonth(lastMonth);

        const selected = el.querySelectorAll('.column.selected');
        expect(selected.length).toBe(1);
        expect(el.querySelectorAll('.column.dimmed').length).toBe(11);
        expect(selected[0].getAttribute('aria-label')).toContain(', selected');

        const color = (selector: string): string =>
          getComputedStyle(el.querySelector(selector) as HTMLElement).backgroundColor;
        expect(color('.column.selected .bar')).toBe('rgb(42, 120, 214)');
        expect(color('.column.dimmed .bar')).toBe('rgba(42, 120, 214, 0.4)');
      });

      it('keeps the tooltips and table for all 12 months', () => {
        selectMonth(lastMonth);

        const tips = Array.from(el.querySelectorAll('.column')).map((c) => c.getAttribute('data-tip') ?? '');
        expect(tips.length).toBe(12);
        expect(tips[10]).toContain('₹1,100.00 (2)');
        expect(tips[10]).not.toContain('selected');
        expect(el.querySelectorAll('details tbody tr').length).toBe(12);
      });
    });

    it('counts an expense by its stored date, first and last day included', async () => {
      await open([
        { id: 'a', title: 'First', amount: 10, category: 'Food', date: '2026-01-01' },
        { id: 'b', title: 'Last', amount: 20, category: 'Food', date: '2026-01-31' },
        { id: 'c', title: 'Before', amount: 100, category: 'Food', date: '2025-12-31' },
        { id: 'd', title: 'After', amount: 200, category: 'Food', date: '2026-02-01' }
      ]);

      selectMonth('2026-01');

      expect(texts('.tile .value')).toEqual(['₹30.00', '2', 'Food']);
    });

    it('adds up a month to the paisa', async () => {
      await open([
        { id: 'a', title: 'One', amount: 0.1, category: 'Food', date: `${thisMonth}-01` },
        { id: 'b', title: 'Two', amount: 0.2, category: 'Food', date: `${thisMonth}-01` }
      ]);

      selectMonth(thisMonth);

      expect(texts('.tile .value')[0]).toBe('₹0.30');
      expect(el.querySelector('.column.selected')?.getAttribute('data-tip')).toContain('₹0.30 (2)');
    });

    it('moves the window back for a month older than it, and returns for All time', async () => {
      const older = shiftMonth(thisMonth, -20);
      await open([...book, { id: 'o', title: 'Old', amount: 75, category: 'Food', date: `${older}-10` }]);

      selectMonth(older);

      const caption = texts('.caption')[0];
      expect(caption).not.toContain('Last');
      expect(caption).toContain(`12 months (${monthName(shiftMonth(older, -11), 'MMM yyyy')} – ${monthName(older, 'MMM yyyy')})`);
      const columns = el.querySelectorAll('.column');
      expect(columns.length).toBe(12);
      expect(columns[11].classList).toContain('selected');
      const rows = el.querySelectorAll('details tbody tr');
      expect(rows.length).toBe(12);
      expect(rows[11].textContent).toContain(monthName(older, 'MMMM yyyy'));

      selectMonth('all');

      expect(texts('.caption')[0]).toContain('Last 12 months');
      expect(el.querySelectorAll('.column')[11].getAttribute('aria-label')).toContain(monthName(thisMonth, 'MMM yyyy'));
    });

    describe('a month without data', () => {
      beforeEach(async () => {
        await open(book);
        selectMonth(emptyMonth);
      });

      it('shows "No data available" in place of both graphs and the table', () => {
        expect(texts('.card .muted')).toEqual(['No data available', 'No data available']);
        expect(el.querySelector('.columns')).toBeNull();
        expect(el.querySelector('details')).toBeNull();
        expect(el.querySelector('.hbars')).toBeNull();
        expect(el.querySelector('.caption')).toBeNull();
      });

      it('shows zeroes and a dash in the tiles', () => {
        expect(texts('.tile .label')).toEqual([`Spent in ${monthName(emptyMonth, 'MMM yyyy')}`, 'Expenses', 'Top category']);
        expect(texts('.tile .value')).toEqual(['₹0.00', '0', '—']);
      });

      it('brings the graphs back for a month with data', () => {
        selectMonth(lastMonth);

        expect(el.textContent).not.toContain('No data available');
        expect(el.querySelectorAll('.column').length).toBe(12);
        expect(texts('.hbars .name')).toEqual(['Bills', 'Food']);
      });

      it('brings the graphs back for All time', () => {
        selectMonth('all');

        expect(el.textContent).not.toContain('No data available');
        expect(el.querySelectorAll('.column').length).toBe(12);
        expect(texts('.hbars .name')).toEqual(['Bills', 'Food', 'Travel']);
      });
    });

    describe('keeping or resetting the selection', () => {
      it('resets to All time when the user leaves and comes back', async () => {
        await open(book);
        selectMonth(lastMonth);

        fixture.destroy();
        render();
        fixture.detectChanges();

        expect(select().value).toBe('all');
        expect(texts('.tile .label')[0]).toBe('Total spent');
      });

      it('starts the next user on All time after a sign-out', async () => {
        spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
        await open(book);
        selectMonth(lastMonth);

        const auth = TestBed.inject(AuthService);
        fixture.destroy();
        const signedOut = auth.logout();
        http.expectOne({ method: 'POST', url: `${AUTH_API}/logout` }).flush(null, { status: 204, statusText: 'No Content' });
        await signedOut;
        await settle();

        const signedIn = auth.login({ email: 'next@example.com', password: 'a-long-password' });
        http.expectOne({ method: 'POST', url: `${AUTH_API}/login` }).flush({ id: 'u2', email: 'next@example.com' });
        await signedIn;
        await settle();

        render();
        await respondWith(book);

        expect(select().value).toBe('all');
        expect(texts('.tile .label')[0]).toBe('Total spent');
      });

      it('shows no data when the selected month loses its expenses but stays in the list', async () => {
        await open(book);
        selectMonth(lastMonth);

        await removeExpense('c');
        await removeExpense('d');

        expect(select().value).toBe(lastMonth);
        expect(texts('.card .muted')).toEqual(['No data available', 'No data available']);
        expect(texts('.tile .value')).toEqual(['₹0.00', '0', '—']);
      });

      it('returns to All time when the selected month drops out of the list', async () => {
        await open(book);
        selectMonth(oldMonth);

        await removeExpense('e');

        expect(select().value).toBe('all');
        expect(texts('.tile .label')[0]).toBe('Total spent');
        expect(texts('.tile .value')).toEqual(['₹2,000.00', '₹900.00', 'Bills']);
        expect(el.querySelectorAll('.column').length).toBe(12);
      });
    });
  });
});
