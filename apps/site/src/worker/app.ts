import { deleteExpired, handleSignup, type SignupEnv } from './signup.ts';

/** The bindings wrangler.toml gives the site's Worker. */
export interface Env extends SignupEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

/** The part of a Worker's execution context the scheduled job uses. */
export interface WaitUntil {
  waitUntil(promise: Promise<unknown>): void;
}

export const SIGNUP_PATH = '/api/signup';

/** Routes a request that reached the Worker: only /api/* does, because run_worker_first lists only it. */
export async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === SIGNUP_PATH) return handleSignup(request, env);
  return env.ASSETS.fetch(request);
}

/** Runs the daily retention job. */
export function scheduled(env: Env, context: WaitUntil): void {
  context.waitUntil(deleteExpired(env.SIGNUPS, new Date()));
}
