/** How many times the generator sends the compiler's log back to the model before it gives up. */
export const maxRetries = 2;

/**
 * Asks a model for a card art shader and checks each answer in this browser. A shader that does not compile, or that
 * the server's rules refuse, goes back to the model with the log, at most `maxRetries` times. The code is never run
 * as JavaScript: `compile` only hands it to the GPU's compiler.
 * @param {{
 *   prompt: string,
 *   request: (input: { prompt: string, attempt: number, compilerLog?: string }) => Promise<{ code: string, problems?: string[] }>,
 *   compile: (code: string) => { ok: true } | { ok: false, log: string },
 *   onAttempt?: (step: { attempt: number, ok: boolean, log: string }) => void,
 * }} options
 * @returns {Promise<{ ok: true, code: string, attempts: number } | { ok: false, code: string, attempts: number, log: string }>}
 */
export async function generateArt({ prompt, request, compile, onAttempt }) {
  let log = '';
  let code = '';
  const attempts = maxRetries + 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const reply = await request({ prompt, attempt, ...(log ? { compilerLog: log } : {}) });
    code = typeof reply?.code === 'string' ? reply.code : '';
    const problems = Array.isArray(reply?.problems) ? reply.problems.filter(item => typeof item === 'string') : [];
    const result = problems.length ? { ok: false, log: problems.join('\n') } : compile(code);
    onAttempt?.({ attempt, ok: result.ok, log: result.ok ? '' : result.log });
    if (result.ok) return { ok: true, code, attempts: attempt };
    log = result.log;
  }
  return { ok: false, code, attempts, log };
}
