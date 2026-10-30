import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Expense } from '../expense.model';
import { EXPENSES_API, ExpenseService } from '../expense.service';
import { ExpenseListComponent } from './expense-list.component';
import { settle, signIn } from '../../testing/sign-in';

const expenses: Expense[] = [
  { id: 'a', title: 'Groceries', amount: 1200.5, category: 'Food', date: '2026-10-03' },
  { id: 'b', title: 'Train', amount: 300, category: 'Travel', date: '2026-10-01' }
];

describe('ExpenseListComponent', () => {
  let fixture: ComponentFixture<ExpenseListComponent>;
  let service: ExpenseService;
  let http: HttpTestingController;
  let el: HTMLElement;

  /** Creates the component and signs in, so the initial GET is sent. */
  async function create(): Promise<void> {
    fixture = TestBed.createComponent(ExpenseListComponent);
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

  function rows(): HTMLLIElement[] {
    return Array.from(el.querySelectorAll('li'));
  }

  /** Clicks Delete on a row and answers the DELETE request with 204. */
  async function deleteRow(index: number, id: string): Promise<void> {
    rows()[index].querySelector<HTMLButtonElement>('.btn-danger')?.click();
    http.expectOne({ method: 'DELETE', url: `${EXPENSES_API}/${id}` }).flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpenseListComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    service = TestBed.inject(ExpenseService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shows a loading message until the API responds', async () => {
    await create();
    fixture.detectChanges();

    expect(el.querySelector('.empty')?.textContent).toContain('Loading…');

    await respondWith([]);
    expect(el.querySelector('.empty')?.textContent).not.toContain('Loading…');
  });

  it('shows an empty state linking to the add page when there are no expenses', async () => {
    await create();
    await respondWith([]);

    expect(rows().length).toBe(0);
    expect(el.querySelector('.empty a')?.getAttribute('href')).toBe('/add');
  });

  it('shows a retry message instead of the empty state when loading fails', async () => {
    await create();
    http.expectOne(EXPENSES_API).flush('down', { status: 500, statusText: 'Server Error' });
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.empty')?.textContent).toContain("Couldn't load your expenses.");
    expect(el.textContent).not.toContain('No expenses yet');

    el.querySelector<HTMLButtonElement>('.empty button')?.click();
    await respondWith(expenses);

    expect(rows().length).toBe(2);
  });

  describe('with expenses', () => {
    beforeEach(async () => {
      await create();
      await respondWith(expenses);
    });

    it('renders one row per expense with title, category and amount', () => {
      const [first, second] = rows();

      expect(rows().length).toBe(2);
      expect(first.querySelector('strong')?.textContent).toBe('Groceries');
      expect(first.querySelector('small')?.textContent).toContain('Food');
      expect(first.querySelector('.amount')?.textContent).toContain('1,200.50');
      expect(second.querySelector('strong')?.textContent).toBe('Train');
    });

    it('shows the total of all expenses', () => {
      expect(el.querySelector('.total')?.textContent).toContain('1,500.50');
    });

    it('links each Edit button to that expense', () => {
      const hrefs = rows().map((row) => row.querySelector('a.btn-secondary')?.getAttribute('href'));

      expect(hrefs).toEqual(['/edit/a', '/edit/b']);
    });

    it('deletes an expense through the API when the user confirms', async () => {
      spyOn(window, 'confirm').and.returnValue(true);

      await deleteRow(0, 'a');

      expect(window.confirm).toHaveBeenCalledWith('Delete "Groceries"?');
      expect(service.expenses().map((e) => e.id)).toEqual(['b']);
      expect(rows().length).toBe(1);
      expect(el.querySelector('.total')?.textContent).toContain('300.00');
    });

    it('sends nothing and keeps the expense when the user cancels', () => {
      spyOn(window, 'confirm').and.returnValue(false);

      rows()[0].querySelector<HTMLButtonElement>('.btn-danger')?.click();
      fixture.detectChanges();

      http.expectNone(`${EXPENSES_API}/a`);
      expect(rows().length).toBe(2);
    });

    it('keeps the expense when the DELETE fails', async () => {
      spyOn(window, 'confirm').and.returnValue(true);

      rows()[0].querySelector<HTMLButtonElement>('.btn-danger')?.click();
      http.expectOne(`${EXPENSES_API}/a`).flush('down', { status: 500, statusText: 'Server Error' });
      await settle();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(rows().length).toBe(2);
      expect(service.error()).toBe("Couldn't delete the expense. The server responded with an error (500).");
    });

    it('shows the empty state after the last expense is deleted', async () => {
      spyOn(window, 'confirm').and.returnValue(true);

      await deleteRow(0, 'a');
      await deleteRow(0, 'b');

      expect(rows().length).toBe(0);
      expect(el.querySelector('.empty a')).not.toBeNull();
    });
  });

  describe('filters and sorting', () => {
    const more: Expense[] = [
      ...expenses,
      { id: 'c', title: 'Electricity bill', amount: 1800, category: 'Bills', date: '2026-09-15' }
    ];

    function titles(): string[] {
      return rows().map((row) => row.querySelector('strong')?.textContent ?? '');
    }

    function setValue(selector: string, value: string, event: 'input' | 'change'): void {
      const control = el.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
      if (!control) {
        throw new Error(`No control matches ${selector}`);
      }
      control.value = value;
      control.dispatchEvent(new Event(event));
      fixture.detectChanges();
    }

    beforeEach(async () => {
      await create();
      await respondWith(more);
    });

    it('shows the count without filters', () => {
      expect(el.querySelector('.summary')?.textContent?.trim()).toBe('3 expenses');
    });

    it('filters by search text and updates the count and total', () => {
      setValue('input[type=search]', 'TRAIN', 'input');

      expect(titles()).toEqual(['Train']);
      expect(el.querySelector('.summary')?.textContent).toContain('Showing 1 of 3');
      expect(el.querySelector('.total')?.textContent).toContain('Total shown');
      expect(el.querySelector('.total')?.textContent).toContain('300.00');
    });

    it('filters by category', () => {
      setValue('select.category', 'Bills', 'change');

      expect(titles()).toEqual(['Electricity bill']);
    });

    it('filters by date range', () => {
      setValue('input.from', '2026-10-01', 'change');

      expect(titles()).toEqual(['Groceries', 'Train']);
    });

    it('sets each end of the range separately, and × clears both', () => {
      expect(el.querySelector('.clear-range')).toBeNull();

      setValue('input.to', '2026-09-30', 'change');
      expect(titles()).toEqual(['Electricity bill']);

      setValue('input.from', '2026-09-20', 'change');
      expect(titles()).toEqual([]);

      el.querySelector<HTMLButtonElement>('.clear-range')?.click();
      fixture.detectChanges();

      expect(titles().length).toBe(3);
      expect(el.querySelector<HTMLInputElement>('input.from')?.value).toBe('');
      expect(el.querySelector<HTMLInputElement>('input.to')?.value).toBe('');
      expect(el.querySelector('.clear-range')).toBeNull();
    });

    it('sorts by amount', () => {
      const sortSelect = 'select.sort';
      setValue(sortSelect, 'amount-desc', 'change');
      expect(titles()).toEqual(['Electricity bill', 'Groceries', 'Train']);

      setValue(sortSelect, 'amount-asc', 'change');
      expect(titles()).toEqual(['Train', 'Groceries', 'Electricity bill']);
    });

    it('shows a no-match message, and Clear filters restores the list', () => {
      setValue('input[type=search]', 'nothing like this', 'input');
      expect(el.textContent).toContain('No expenses match these filters.');

      el.querySelector<HTMLButtonElement>('.summary .link')?.click();
      fixture.detectChanges();

      expect(titles().length).toBe(3);
      expect(el.querySelector<HTMLInputElement>('input[type=search]')?.value).toBe('');
    });

    it('keeps filters when the page is opened again', async () => {
      setValue('select.category', 'Travel', 'change');

      fixture.destroy();
      fixture = TestBed.createComponent(ExpenseListComponent);
      el = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();

      expect(titles()).toEqual(['Train']);
      expect(el.querySelector<HTMLSelectElement>('select.category')?.value).toBe('Travel');
    });

    it('offers CSV and Excel downloads of the whole book', () => {
      const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('.export a'));

      expect(links.map((a) => a.textContent?.trim())).toEqual(['Export CSV', 'Export Excel']);
      expect(links.map((a) => a.getAttribute('href'))).toEqual([`${EXPENSES_API}/export.csv`, `${EXPENSES_API}/export.xlsx`]);
      expect(links.every((a) => a.hasAttribute('download'))).toBeTrue();
    });

    it('exports only what the filters show, in the chosen order', () => {
      setValue('select.category', 'Bills', 'change');
      setValue('input[type=search]', 'city bill', 'input');
      setValue('select.sort', 'amount-desc', 'change');

      const csv = el.querySelector<HTMLAnchorElement>('.export a')?.getAttribute('href');
      expect(csv).toBe(`${EXPENSES_API}/export.csv?search=city+bill&category=Bills&sort=amount-desc`);
    });

    it('hides the export links when nothing matches', () => {
      setValue('input[type=search]', 'nothing like this', 'input');

      expect(el.querySelector('.export')).toBeNull();
    });
  });
});
