import { createServer } from 'node:http';

/** A shader that does not compile: it mixes an int into float arithmetic. */
export const brokenShader = 'vec3 art_custom(vec2 uv, float t) {\n  float k = 1;\n  return vec3(uv.x * k, uv.y, 0.5 + 0.5 * sin(t));\n}';

/** A shader that compiles and moves: soft bands of colour drifting across the window. */
export const workingShader = 'float cu_band(vec2 p, float t) { return 0.5 + 0.5 * sin(p.x * 9.0 + p.y * 4.0 + t * 0.8); }\nvec3 art_custom(vec2 uv, float t) {\n  vec2 p = (uv - 0.5) * vec2(1.25, 1.0);\n  float px = max(fwidth(uv.y), 1e-4);\n  vec3 col = mix(vec3(0.05, 0.02, 0.12), vec3(0.95, 0.55, 0.2), cu_band(p, t));\n  col += vec3(0.4, 0.7, 1.0) * exp(-length(p - vec2(0.2, 0.1)) * 6.0) * (0.6 + 0.4 * sin(t));\n  col *= 1.0 - 0.6 * dot(uv - 0.5, uv - 0.5) + px * 0.0;\n  return clamp(col, 0.0, 1.0);\n}';

/**
 * An OpenAI-compatible chat completions endpoint for the browser check: the first answer of each generation does not
 * compile, the retry (which must carry the compiler log) does. It records every request so the check can assert the
 * key, the prompt and the log. No model is called.
 */
export async function startFakeArtModel() {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      const content = String(body.messages?.[0]?.content ?? '');
      requests.push({ path: req.url, authorization: req.headers.authorization, model: body.model, content });
      const retry = content.includes('failed to compile with this log');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: `\`\`\`glsl\n${retry ? workingShader : brokenShader}\n\`\`\`` } }] }));
    });
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  return {
    url: `http://127.0.0.1:${server.address().port}/v1`,
    requests,
    close: () => new Promise(done => server.close(() => done())),
  };
}
