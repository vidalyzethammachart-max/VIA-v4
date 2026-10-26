import test from 'node:test';
import assert from 'node:assert/strict';

test('local analysis serves only authenticated video analysis on loopback', async t => {
  const saved = { ...process.env };
  Object.assign(process.env, {
    VIDEO_ANALYSIS_PROVIDER: 'gemini', GEMINI_API_KEY: 'synthetic-not-real',
    GEMINI_MODEL: 'gemini-2.5-flash', ANALYSIS_API_TOKEN: 'synthetic-service-token',
    VIDEO_ALLOW_LOCAL_TEST_URLS: 'false',
  });
  t.after(() => { process.env = saved; });
  const { startLocalAnalysisServer } = await import('../server/local-analysis.js');
  const server = await startLocalAnalysisServer({ port: 0 });
  t.after(() => new Promise(resolve => server.close(resolve)));
  assert.equal(server.address().address, '127.0.0.1');
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (path, method = 'POST', authorized = true) => fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: 'Bearer synthetic-service-token' } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify({ fileUrl: 'https://example.invalid/synthetic.mp4' }) } : {}),
  });
  assert.equal((await send('/api/analyze-video', 'POST', false)).status, 401);
  const validation = await send('/api/analyze-video');
  assert.equal(validation.status, 422);
  assert.equal((await validation.json()).code, 'invalid_video');
  for (const [path, method] of [
    ['/', 'GET'], ['/health', 'GET'], ['/api/analyze-video', 'GET'],
    ['/api/upload-video', 'POST'], ['/api/r2-presign-upload', 'POST'],
    ['/api/analyze-video-case', 'POST'], ['/api/analyze-video-aggregate', 'POST'],
  ]) assert.equal((await send(path, method)).status, 404, `${method} ${path} must not be exposed`);
});

test('local analysis refuses missing auth, other providers and local source test mode', async t => {
  const saved = { ...process.env };
  Object.assign(process.env, { VIDEO_ANALYSIS_PROVIDER: 'gemini', GEMINI_API_KEY: 'synthetic-not-real',
    GEMINI_MODEL: 'gemini-2.5-flash', ANALYSIS_API_TOKEN: 'synthetic-service-token', VIDEO_ALLOW_LOCAL_TEST_URLS: 'false' });
  t.after(() => { process.env = saved; });
  const { startLocalAnalysisServer } = await import('../server/local-analysis.js');
  delete process.env.ANALYSIS_API_TOKEN;
  await assert.rejects(startLocalAnalysisServer({ port: 0 }), /ANALYSIS_API_TOKEN/);
  process.env.ANALYSIS_API_TOKEN = 'synthetic-service-token';
  process.env.VIDEO_ANALYSIS_PROVIDER = 'openai';
  await assert.rejects(startLocalAnalysisServer({ port: 0 }), /gemini/);
  process.env.VIDEO_ANALYSIS_PROVIDER = 'gemini';
  process.env.GEMINI_MODEL = 'gemini-3.8-flash';
  await assert.rejects(startLocalAnalysisServer({ port: 0 }), /GEMINI_MODEL/);
  process.env.GEMINI_MODEL = 'gemini-2.5-flash';
  process.env.VIDEO_ALLOW_LOCAL_TEST_URLS = 'true';
  await assert.rejects(startLocalAnalysisServer({ port: 0 }), /VIDEO_ALLOW_LOCAL_TEST_URLS/);
});
