import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { AUTH_API } from './auth/auth.service';
import { EXPENSES_API, ExpenseService } from './expenses/expense.service';
import { TEST_USER, settle, signIn } from './testing/sign-in';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'expense-book' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('expense-book');
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Expense Book');
  });

  it('hides the nav while signed out', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('nav')).toBeNull();
    expect(compiled.querySelector('.sign-out')).toBeNull();
  });

  it('shows the nav and email once signed in, and Sign out goes to /login', async () => {
    const http = TestBed.inject(HttpTestingController);
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const fixture = TestBed.createComponent(AppComponent);
    const compiled = fixture.nativeElement as HTMLElement;
    await signIn(http);
    http.expectOne(EXPENSES_API).flush([]);
    fixture.detectChanges();

    expect(compiled.querySelector('nav')).not.toBeNull();
    expect(compiled.querySelector('.email')?.textContent).toBe(TEST_USER.email);

    compiled.querySelector<HTMLButtonElement>('.sign-out')?.click();
    http.expectOne({ method: 'POST', url: `${AUTH_API}/logout` }).flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith('/login');
    expect(compiled.querySelector('nav')).toBeNull();
    http.verify();
  });

  it('shows the error banner and hides it when dismissed', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const compiled = fixture.nativeElement as HTMLElement;
    const service = TestBed.inject(ExpenseService);
    await settle();
    const failed = service.remove('x');
    TestBed.inject(HttpTestingController).expectOne(`${EXPENSES_API}/x`).flush('down', { status: 500, statusText: 'Server Error' });
    await failed;
    fixture.detectChanges();

    expect(compiled.querySelector('.error-banner')?.textContent).toContain("Couldn't delete the expense.");

    compiled.querySelector<HTMLButtonElement>('.error-banner .dismiss')?.click();
    fixture.detectChanges();

    expect(compiled.querySelector('.error-banner')).toBeNull();
  });
});
