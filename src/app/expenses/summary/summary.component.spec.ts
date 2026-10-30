import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Expense } from '../expense.model';
import { EXPENSES_API } from '../expense.service';
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

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(SummaryComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
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
});
