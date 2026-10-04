import { route, scheduled, type Env, type WaitUntil } from './app.ts';

export default {
  fetch: (request: Request, env: Env) => route(request, env),
  scheduled: (_controller: unknown, env: Env, context: WaitUntil) => scheduled(env, context),
};
