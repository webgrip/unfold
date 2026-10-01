import { PRIVACY_VERSION, SIGNUP_RETENTION_MONTHS } from '../config/site.ts';
import { isLocale, type Locale } from '../i18n/config.ts';
import { routePath } from '../i18n/routes.ts';

/** The four answers to "what interests you"; the form, the dictionaries and the database share them. */
export const INTERESTS = ['hosted', 'agency', 'both', 'self-host-support'] as const;
export type Interest = (typeof INTERESTS)[number];

/** The form field a person never sees; a request that fills it is answered as a success and stored nowhere. */
export const HONEYPOT_FIELD = 'homepage';

export const MAX_BODY_BYTES = 8 * 1024;

/** The subset of Cloudflare's D1 binding the sign-up handler uses. */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
}

export interface D1Like {
  prepare(sql: string): D1Statement;
}

export interface SignupEnv {
  SIGNUPS: D1Like;
}

export const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS signups (
  email TEXT PRIMARY KEY,
  interest TEXT NOT NULL,
  locale TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  consented_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

export const UPSERT = `INSERT INTO signups (email, interest, locale, consent_version, consented_at, created_at, updated_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?5)
ON CONFLICT(email) DO UPDATE SET
  interest = excluded.interest,
  locale = excluded.locale,
  consent_version = excluded.consent_version,
  consented_at = excluded.consented_at,
  updated_at = excluded.updated_at`;

export const DELETE_EXPIRED = 'DELETE FROM signups WHERE updated_at < ?1';

export type SignupError = 'invalid_email' | 'invalid_interest' | 'consent_required' | 'unavailable';

export interface Signup {
  email: string;
  interest: Interest;
  locale: Locale;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reads and checks a submitted form; `spam` is true when the honeypot was filled. */
export function parseSignup(
  form: FormData,
): { ok: true; signup: Signup; spam: boolean } | { ok: false; error: SignupError; locale: Locale } {
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value.trim() : '';
  };
  const localeField = field('locale');
  const locale: Locale = isLocale(localeField) ? localeField : 'en';
  const email = field('email').toLowerCase();
  if (email.length > 254 || !EMAIL.test(email))
    return { ok: false, error: 'invalid_email', locale };
  const interest = field('interest');
  if (!(INTERESTS as readonly string[]).includes(interest))
    return { ok: false, error: 'invalid_interest', locale };
  if (field('consent') !== 'yes') return { ok: false, error: 'consent_required', locale };
  return {
    ok: true,
    signup: { email, interest: interest as Interest, locale },
    spam: field(HONEYPOT_FIELD) !== '',
  };
}

let tableReady: Promise<unknown> | undefined;

/** Creates the table once per isolate; a failed attempt is retried on the next request. */
export function ensureTable(db: D1Like): Promise<unknown> {
  tableReady ??= db
    .prepare(CREATE_TABLE)
    .run()
    .catch((error: unknown) => {
      tableReady = undefined;
      throw error;
    });
  return tableReady;
}

/** Forgets that the table exists, so tests start from a fresh isolate. */
export function resetTableCache(): void {
  tableReady = undefined;
}

/** Stores a sign-up, replacing an earlier one with the same lowercase email. */
export async function storeSignup(db: D1Like, signup: Signup, now: Date): Promise<void> {
  await ensureTable(db);
  await db
    .prepare(UPSERT)
    .bind(signup.email, signup.interest, signup.locale, PRIVACY_VERSION, now.toISOString())
    .run();
}

/** The moment before which a sign-up has passed its retention period. */
export function retentionCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - SIGNUP_RETENTION_MONTHS);
  return cutoff;
}

/** Deletes every sign-up that was last confirmed before the retention cutoff. */
export async function deleteExpired(db: D1Like, now: Date): Promise<void> {
  await ensureTable(db);
  await db.prepare(DELETE_EXPIRED).bind(retentionCutoff(now).toISOString()).run();
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function redirect(request: Request, path: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location: new URL(path, request.url).href, 'cache-control': 'no-store' },
  });
}

function wantsJson(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('application/json');
}

function failure(request: Request, status: number, error: SignupError, locale: Locale): Response {
  return wantsJson(request)
    ? json(status, { ok: false, error })
    : redirect(request, routePath('signupProblem', locale));
}

/** Handles POST /api/signup from the plain form (303 to a page) and from fetch (JSON). */
export async function handleSignup(
  request: Request,
  env: SignupEnv,
  now: Date = new Date(),
): Promise<Response> {
  if (request.method !== 'POST')
    return json(405, { ok: false, error: 'method_not_allowed' }, { allow: 'POST' });
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== new URL(request.url).origin)
    return json(403, { ok: false, error: 'cross_origin' });
  const type = request.headers.get('content-type') ?? '';
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)\b/.test(type))
    return json(415, { ok: false, error: 'unsupported_media_type' });
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'too_large' });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return failure(request, 400, 'invalid_email', 'en');
  }
  const parsed = parseSignup(form);
  if (!parsed.ok) return failure(request, 400, parsed.error, parsed.locale);
  const { signup, spam } = parsed;
  if (!spam) {
    try {
      await storeSignup(env.SIGNUPS, signup, now);
    } catch {
      return failure(request, 503, 'unavailable', signup.locale);
    }
  }
  return wantsJson(request)
    ? json(200, { ok: true })
    : redirect(request, routePath('thanks', signup.locale));
}
