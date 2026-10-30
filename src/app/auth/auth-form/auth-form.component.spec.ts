import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TEST_USER, settle } from '../../testing/sign-in';
import { AUTH_API } from '../auth.service';
import { AuthFormComponent, AuthMode } from './auth-form.component';

describe('AuthFormComponent', () => {
  let fixture: ComponentFixture<AuthFormComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;
  let navigate: jasmine.Spy;

  function create(mode: AuthMode): void {
    fixture = TestBed.createComponent(AuthFormComponent);
    fixture.componentRef.setInput('mode', mode);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  function type(selector: string, value: string): void {
    const input = el.querySelector<HTMLInputElement>(selector);
    if (!input) {
      throw new Error(`No input matches ${selector}`);
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
  }

  function fill(email: string, password: string): void {
    type('input[type=email]', email);
    type('input[type=password]', password);
    fixture.detectChanges();
  }

  function submit(): void {
    el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
    fixture.detectChanges();
  }

  function errors(): string[] {
    return Array.from(el.querySelectorAll('.error, .form-error')).map((n) => n.textContent?.trim() ?? '');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthFormComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
  });

  afterEach(() => http.verify());

  describe('sign in', () => {
    beforeEach(() => create('login'));

    it('shows the sign-in heading and a link to sign up', () => {
      expect(el.querySelector('h2')?.textContent).toBe('Sign in');
      expect(el.querySelector('.switch a')?.getAttribute('href')).toBe('/signup');
    });

    it('sends the email normalised and goes to the expenses', async () => {
      fill('  Me@Example.COM ', 'short');
      submit();

      const req = http.expectOne({ method: 'POST', url: `${AUTH_API}/login` });
      expect(req.request.body).toEqual({ email: 'me@example.com', password: 'short' });
      req.flush(TEST_USER);
      await settle();

      expect(navigate).toHaveBeenCalledWith('/expenses');
    });

    it("shows the API's reason and stays on the page when sign-in fails", async () => {
      fill('me@example.com', 'wrong password');
      submit();

      http
        .expectOne(`${AUTH_API}/login`)
        .flush({ error: 'Email or password is incorrect.' }, { status: 401, statusText: 'Unauthorized' });
      await settle();
      fixture.detectChanges();

      expect(errors()).toEqual(['Email or password is incorrect.']);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('sends nothing until the email is valid and a password is given', () => {
      fill('not-an-email', '');
      submit();

      http.expectNone(`${AUTH_API}/login`);
      expect(errors()).toEqual(['Enter a valid email address.', 'Enter your password.']);
    });
  });

  describe('sign up', () => {
    beforeEach(() => create('signup'));

    it('shows the create-account heading and a link to sign in', () => {
      expect(el.querySelector('h2')?.textContent).toBe('Create your account');
      expect(el.querySelector('.switch a')?.getAttribute('href')).toBe('/login');
    });

    it('requires at least 8 characters', () => {
      fill('me@example.com', 'short');
      submit();

      http.expectNone(`${AUTH_API}/signup`);
      expect(errors()).toEqual(['Use at least 8 characters.']);
    });

    it('creates the account and goes to the expenses', async () => {
      fill('me@example.com', 'long enough');
      submit();

      http.expectOne({ method: 'POST', url: `${AUTH_API}/signup` }).flush(TEST_USER, { status: 201, statusText: 'Created' });
      await settle();

      expect(navigate).toHaveBeenCalledWith('/expenses');
    });
  });
});
