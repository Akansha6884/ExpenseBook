import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Expense } from '../expense.model';
import { EXPENSES_API, ExpenseService } from '../expense.service';
import { ExpenseFormComponent } from './expense-form.component';
import { settle, signIn } from '../../testing/sign-in';

const saved: Expense = { id: 'e1', title: 'Rent', amount: 15000, category: 'Bills', date: '2026-10-05' };

describe('ExpenseFormComponent', () => {
  let fixture: ComponentFixture<ExpenseFormComponent>;
  let component: ExpenseFormComponent;
  let service: ExpenseService;
  let http: HttpTestingController;
  let el: HTMLElement;

  /** Creates the component and answers the initial GET with `existing`. */
  async function create(existing: Expense[], id?: string): Promise<void> {
    fixture = TestBed.createComponent(ExpenseFormComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    if (id !== undefined) {
      fixture.componentRef.setInput('id', id);
    }
    fixture.detectChanges();
    await signIn(http);
    http.expectOne({ method: 'GET', url: EXPENSES_API }).flush(existing);
    await settle();
    await fixture.whenStable();
    TestBed.flushEffects();
    fixture.detectChanges();
  }

  function heading(): string {
    return el.querySelector('h2')?.textContent?.trim() ?? '';
  }

  function submitButton(): HTMLButtonElement | null {
    return el.querySelector<HTMLButtonElement>('button[type=submit]');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpenseFormComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    service = TestBed.inject(ExpenseService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('add mode', () => {
    beforeEach(() => create([]));

    it('shows the Add heading and button', () => {
      expect(heading()).toBe('Add Expense');
      expect(submitButton()?.textContent?.trim()).toBe('Add');
    });

    it('starts with category Food and today as the date', () => {
      const { category, date } = component.form.getRawValue();
      expect(category).toBe('Food');
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      expect(date).toBe(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    });

    it('does not send anything and shows errors when the form is invalid', async () => {
      await component.submit();
      fixture.detectChanges();

      http.expectNone(EXPENSES_API);
      expect(el.querySelectorAll('.error').length).toBe(2);
    });

    it('rejects a zero amount', async () => {
      component.form.patchValue({ title: 'Coffee', amount: 0 });

      await component.submit();

      http.expectNone(EXPENSES_API);
      expect(component.form.controls.amount.hasError('min')).toBeTrue();
    });

    it('starts with a blank amount field, not 0', () => {
      expect(component.form.controls.amount.value).toBeNull();
      expect(el.querySelector<HTMLInputElement>('input[formcontrolname=amount]')?.value).toBe('');
    });

    it('rejects a title that is only spaces, with a field error', async () => {
      component.form.patchValue({ title: '    ', amount: 5 });

      await component.submit();
      fixture.detectChanges();

      http.expectNone(EXPENSES_API);
      expect(el.querySelector('.error')?.textContent).toContain('Title is required');
    });

    it('rejects more than 2 decimal places', async () => {
      component.form.patchValue({ title: 'Odd', amount: 10.555 });

      await component.submit();
      fixture.detectChanges();

      http.expectNone(EXPENSES_API);
      expect(el.querySelector('.error')?.textContent).toContain('Use at most 2 decimal places.');
    });

    it('rejects an amount over the maximum', async () => {
      component.form.patchValue({ title: 'Huge', amount: 1e308 });

      await component.submit();
      fixture.detectChanges();

      http.expectNone(EXPENSES_API);
      expect(el.querySelector('.error')?.textContent).toContain("can't be more than");
    });

    it('POSTs a valid expense with a trimmed title and shows a confirmation', async () => {
      component.form.patchValue({ title: '  Coffee  ', amount: 120, category: 'Food', date: '2026-10-10' });

      const done = component.submit();
      const req = http.expectOne({ method: 'POST', url: EXPENSES_API });
      expect(req.request.body).toEqual({ title: 'Coffee', amount: 120, category: 'Food', date: '2026-10-10' });
      req.flush({ ...req.request.body, id: 'new' });
      await done;
      fixture.detectChanges();

      expect(service.expenses().map((e) => e.id)).toEqual(['new']);
      expect(el.querySelector('.success')?.textContent).toContain('"Coffee" added.');
    });

    it('disables the button while saving', async () => {
      component.form.patchValue({ title: 'Coffee', amount: 120 });

      const done = component.submit();
      fixture.detectChanges();
      expect(submitButton()?.disabled).toBeTrue();
      expect(submitButton()?.textContent?.trim()).toBe('Saving…');

      http.expectOne(EXPENSES_API).flush({ ...saved, id: 'new' });
      await done;
      fixture.detectChanges();
      expect(submitButton()?.disabled).toBeFalse();
    });

    it('clears title and amount after adding but keeps category and date', async () => {
      component.form.patchValue({ title: 'Bus', amount: 40, category: 'Travel', date: '2026-10-11' });

      const done = component.submit();
      http.expectOne(EXPENSES_API).flush({ ...saved, id: 'new' });
      await done;

      expect(component.form.getRawValue()).toEqual({ title: '', amount: null, category: 'Travel', date: '2026-10-11' });
    });

    it('keeps the form filled in when the API call fails', async () => {
      component.form.patchValue({ title: 'Bus', amount: 40 });

      const done = component.submit();
      http.expectOne(EXPENSES_API).flush('down', { status: 500, statusText: 'Server Error' });
      await done;
      fixture.detectChanges();

      expect(component.form.getRawValue().title).toBe('Bus');
      expect(el.querySelector('.success')).toBeNull();
      expect(service.error()).toBe("Couldn't add the expense. The server responded with an error (500).");
    });
  });

  describe('edit mode', () => {
    it('shows the Edit heading, Save button and Cancel link', async () => {
      await create([saved], 'e1');

      expect(heading()).toBe('Edit Expense');
      expect(submitButton()?.textContent?.trim()).toBe('Save changes');
      expect(el.querySelector('a.btn-secondary')?.textContent?.trim()).toBe('Cancel');
    });

    it('fills the form with the expense once it has loaded', async () => {
      await create([saved], 'e1');

      expect(component.form.getRawValue()).toEqual({
        title: 'Rent',
        amount: 15000,
        category: 'Bills',
        date: '2026-10-05'
      });
    });

    it('PUTs the changes and navigates back to the list', async () => {
      await create([saved], 'e1');
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      component.form.patchValue({ title: 'Rent (Oct)', amount: 16000 });

      const done = component.submit();
      const req = http.expectOne({ method: 'PUT', url: `${EXPENSES_API}/e1` });
      req.flush({ ...saved, title: 'Rent (Oct)', amount: 16000 });
      await done;

      expect(service.expenses()).toEqual([{ ...saved, title: 'Rent (Oct)', amount: 16000 }]);
      expect(navigate).toHaveBeenCalledWith(['/expenses']);
    });

    it('stays on the page when saving fails', async () => {
      await create([saved], 'e1');
      const navigate = spyOn(TestBed.inject(Router), 'navigate');

      const done = component.submit();
      http.expectOne(`${EXPENSES_API}/e1`).flush('down', { status: 500, statusText: 'Server Error' });
      await done;

      expect(navigate).not.toHaveBeenCalled();
      expect(service.error()).toBe("Couldn't save the expense. The server responded with an error (500).");
    });

    it('does not send invalid changes', async () => {
      await create([saved], 'e1');
      component.form.patchValue({ title: '' });

      await component.submit();

      http.expectNone(`${EXPENSES_API}/e1`);
    });

    it('shows a not-found message for an unknown id', async () => {
      await create([saved], 'missing');

      expect(el.textContent).toContain("This expense doesn't exist.");
      expect(el.querySelector('form')).toBeNull();
    });
  });
});
