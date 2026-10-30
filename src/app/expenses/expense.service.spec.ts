import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AUTH_API, AuthService } from '../auth/auth.service';
import { settle, signIn } from '../testing/sign-in';
import { Expense, NewExpense } from './expense.model';
import { EXPENSES_API, ExpenseService } from './expense.service';

const lunch: Expense = { id: 'a', title: 'Lunch', amount: 250, category: 'Food', date: '2026-10-01' };
const taxi: Expense = { id: 'b', title: 'Taxi', amount: 400, category: 'Travel', date: '2026-10-02' };

function withoutId({ id: _id, ...rest }: Expense): NewExpense {
  return rest;
}

describe('ExpenseService', () => {
  let service: ExpenseService;
  let http: HttpTestingController;

  /** Signs in and answers the initial GET with `expenses`. */
  async function loadWith(expenses: Expense[]): Promise<void> {
    await signIn(http);
    http.expectOne({ method: 'GET', url: EXPENSES_API }).flush(expenses);
    await settle();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ExpenseService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('loading', () => {
    it('does not fetch while signed out', async () => {
      await settle();
      http.expectNone(EXPENSES_API);
      expect(service.expenses()).toEqual([]);
      expect(service.loaded()).toBeFalse();
    });

    it('fetches expenses from the API once signed in', async () => {
      await loadWith([taxi, lunch]);

      expect(service.expenses()).toEqual([taxi, lunch]);
      expect(service.loaded()).toBeTrue();
      expect(service.error()).toBeNull();
    });

    it('sets an error and still marks loaded when the fetch fails', async () => {
      await signIn(http);
      http.expectOne(EXPENSES_API).flush('down', { status: 500, statusText: 'Server Error' });
      await settle();

      expect(service.expenses()).toEqual([]);
      expect(service.loaded()).toBeTrue();
      expect(service.error()).toBe("Couldn't load expenses. The server responded with an error (500).");
      expect(service.loadFailed()).toBeTrue();
    });

    it('clears loadFailed when a retry succeeds', async () => {
      await signIn(http);
      http.expectOne(EXPENSES_API).flush('down', { status: 500, statusText: 'Server Error' });
      await settle();

      const retry = service.reload();
      http.expectOne(EXPENSES_API).flush([lunch]);
      await retry;

      expect(service.loadFailed()).toBeFalse();
      expect(service.error()).toBeNull();
      expect(service.expenses()).toEqual([lunch]);
    });
  });

  describe('accounts', () => {
    it('drops the book and any error on sign-out', async () => {
      spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
      await loadWith([lunch]);
      const failed = service.remove('a');
      http.expectOne(`${EXPENSES_API}/a`).flush('down', { status: 500, statusText: 'Server Error' });
      await failed;

      const signedOut = TestBed.inject(AuthService).logout();
      http.expectOne({ method: 'POST', url: `${AUTH_API}/logout` }).flush(null, { status: 204, statusText: 'No Content' });
      await signedOut;
      await settle();

      expect(service.expenses()).toEqual([]);
      expect(service.loaded()).toBeFalse();
      expect(service.error()).toBeNull();
    });

    it('does not show a banner for a 401 (the user is sent to sign in instead)', async () => {
      await signIn(http);
      http.expectOne(EXPENSES_API).flush({ error: 'Please sign in.' }, { status: 401, statusText: 'Unauthorized' });
      await settle();

      expect(service.error()).toBeNull();
    });
  });

  describe('changes', () => {
    beforeEach(() => loadWith([lunch]));

    it('add() POSTs the expense and prepends the created one', async () => {
      const result = service.add(withoutId(taxi));

      const req = http.expectOne({ method: 'POST', url: EXPENSES_API });
      expect(req.request.body).toEqual(withoutId(taxi));
      req.flush(taxi);

      expect(await result).toBeTrue();
      expect(service.expenses()).toEqual([taxi, lunch]);
    });

    it('edit() PUTs the changes and replaces the expense in place', async () => {
      const changes: NewExpense = { ...withoutId(lunch), title: 'Dinner', amount: 600 };
      const result = service.edit('a', changes);

      const req = http.expectOne({ method: 'PUT', url: `${EXPENSES_API}/a` });
      expect(req.request.body).toEqual(changes);
      req.flush({ ...changes, id: 'a' });

      expect(await result).toBeTrue();
      expect(service.expenses()).toEqual([{ ...changes, id: 'a' }]);
    });

    it('remove() DELETEs the expense and drops it from the list', async () => {
      const result = service.remove('a');

      http.expectOne({ method: 'DELETE', url: `${EXPENSES_API}/a` }).flush(null, { status: 204, statusText: 'No Content' });

      expect(await result).toBeTrue();
      expect(service.expenses()).toEqual([]);
    });

    it('keeps the list unchanged and sets an error when a request fails', async () => {
      const result = service.remove('a');

      http.expectOne(`${EXPENSES_API}/a`).flush('gone', { status: 404, statusText: 'Not Found' });

      expect(await result).toBeFalse();
      expect(service.expenses()).toEqual([lunch]);
      expect(service.error()).toBe("Couldn't delete the expense. The server responded with an error (404).");
    });

    it("shows the API's own reason when it rejects the data", async () => {
      const result = service.add(withoutId(taxi));

      http.expectOne(EXPENSES_API).flush({ error: 'Title must be 1-60 characters.' }, { status: 400, statusText: 'Bad Request' });

      expect(await result).toBeFalse();
      expect(service.error()).toBe("Couldn't add the expense. Title must be 1-60 characters.");
    });

    it('clearError() hides the error', async () => {
      const failed = service.remove('a');
      http.expectOne(`${EXPENSES_API}/a`).flush('down', { status: 500, statusText: 'Server Error' });
      await failed;

      service.clearError();

      expect(service.error()).toBeNull();
    });

    it('clears the error after the next successful request', async () => {
      const failed = service.add(withoutId(taxi));
      http.expectOne(EXPENSES_API).error(new ProgressEvent('offline'));
      await failed;
      expect(service.error()).toBe("Couldn't add the expense. Can't reach the server. Is the API running?");

      const retried = service.add(withoutId(taxi));
      http.expectOne(EXPENSES_API).flush(taxi);
      await retried;

      expect(service.error()).toBeNull();
    });

    it('total sums all amounts and updates on change', async () => {
      expect(service.total()).toBe(250);

      const result = service.add(withoutId(taxi));
      http.expectOne(EXPENSES_API).flush(taxi);
      await result;

      expect(service.total()).toBe(650);
    });
  });
});
