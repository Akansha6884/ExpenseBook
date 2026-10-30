import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { EXPENSES_API } from '../expenses/expense.service';
import { TEST_USER } from '../testing/sign-in';
import { User } from './auth.model';
import { guestGuard, signedInGuard } from './auth.guards';
import { AUTH_API, AuthService } from './auth.service';
import { sessionInterceptor } from './session.interceptor';

const credentials = { email: 'me@example.com', password: 'correct horse' };

function setUp(platform: 'browser' | 'server' = 'browser'): void {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([sessionInterceptor])),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: platform }
    ]
  });
}

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  async function signedIn(): Promise<void> {
    const result = auth.login(credentials);
    http.expectOne(`${AUTH_API}/login`).flush(TEST_USER);
    await result;
  }

  beforeEach(() => {
    setUp();
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks the API who is signed in only once', async () => {
    const first = auth.ensureChecked();
    const second = auth.ensureChecked();
    http.expectOne(`${AUTH_API}/me`).flush(TEST_USER);
    await Promise.all([first, second]);

    expect(auth.user()).toEqual(TEST_USER);
  });

  it('treats a 401 from /me as signed out', async () => {
    const checked = auth.ensureChecked();
    http.expectOne(`${AUTH_API}/me`).flush({ error: 'Not signed in.' }, { status: 401, statusText: 'Unauthorized' });
    await checked;

    expect(auth.user()).toBeNull();
  });

  it('login() signs in and resolves to null', async () => {
    const result = auth.login(credentials);
    const req = http.expectOne({ method: 'POST', url: `${AUTH_API}/login` });
    expect(req.request.body).toEqual(credentials);
    req.flush(TEST_USER);

    expect(await result).toBeNull();
    expect(auth.user()).toEqual(TEST_USER);
  });

  it("login() resolves to the API's reason on failure", async () => {
    const result = auth.login(credentials);
    http
      .expectOne(`${AUTH_API}/login`)
      .flush({ error: 'Email or password is incorrect.' }, { status: 401, statusText: 'Unauthorized' });

    expect(await result).toBe('Email or password is incorrect.');
    expect(auth.user()).toBeNull();
  });

  it('signup() signs the new account in', async () => {
    const result = auth.signup(credentials);
    http.expectOne({ method: 'POST', url: `${AUTH_API}/signup` }).flush(TEST_USER, { status: 201, statusText: 'Created' });

    expect(await result).toBeNull();
    expect(auth.user()).toEqual(TEST_USER);
  });

  it('logout() signs out even if the server is unreachable', async () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    await signedIn();

    const signedOut = auth.logout();
    http.expectOne(`${AUTH_API}/logout`).error(new ProgressEvent('offline'));
    await signedOut;

    expect(auth.user()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('a 401 from the expenses API ends the session; one from the auth API does not', async () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    await signedIn();

    const wrongPassword = auth.login(credentials);
    http.expectOne(`${AUTH_API}/login`).flush({ error: 'nope' }, { status: 401, statusText: 'Unauthorized' });
    await wrongPassword;
    expect(navigate).not.toHaveBeenCalled();

    const expired = firstValueFrom(TestBed.inject(HttpClient).get(EXPENSES_API)).catch(() => 'failed');
    http.expectOne(EXPENSES_API).flush({ error: 'Please sign in.' }, { status: 401, statusText: 'Unauthorized' });
    expect(await expired).toBe('failed');

    expect(auth.user()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});

describe('auth guards', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  function run(guard: CanActivateFn): Promise<boolean | UrlTree> {
    return TestBed.runInInjectionContext(() => guard(route, state) as Promise<boolean | UrlTree>);
  }

  /** Runs the guard with the API answering /me for `user` (or 401); returns true or the redirect URL. */
  async function check(guard: CanActivateFn, user: User | null): Promise<boolean | string> {
    const result = run(guard);
    const me = TestBed.inject(HttpTestingController).expectOne(`${AUTH_API}/me`);
    if (user) {
      me.flush(user);
    } else {
      me.flush({ error: 'Not signed in.' }, { status: 401, statusText: 'Unauthorized' });
    }
    const outcome = await result;
    return outcome instanceof UrlTree ? TestBed.inject(Router).serializeUrl(outcome) : outcome;
  }

  describe('in the browser', () => {
    beforeEach(() => setUp());

    it('signedInGuard sends signed-out visitors to /login', async () => {
      expect(await check(signedInGuard, null)).toBe('/login');
    });

    it('signedInGuard lets a signed-in user through', async () => {
      expect(await check(signedInGuard, TEST_USER)).toBeTrue();
    });

    it('guestGuard sends a signed-in user to /expenses', async () => {
      expect(await check(guestGuard, TEST_USER)).toBe('/expenses');
    });

    it('guestGuard lets signed-out visitors through', async () => {
      expect(await check(guestGuard, null)).toBeTrue();
    });
  });

  describe('on the server', () => {
    beforeEach(() => setUp('server'));

    it('lets every page render without calling the API', async () => {
      expect(await run(signedInGuard)).toBeTrue();
      expect(await run(guestGuard)).toBeTrue();
      TestBed.inject(HttpTestingController).verify();
    });
  });
});
