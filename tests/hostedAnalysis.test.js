import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHostedAnalysisApp, startHostedAnalysisServer } from '../server/hosted-analysis.js';

function configure(t) {
  const saved = { ...process.env };
  Object.assign(process.env, {
    VIDEO_ANALYSIS_PROVIDER: 'gemini', GEMINI_API_KEY: 'synthetic-not-real',
    GEMINI_MODEL: 'gemini-2.5-flash', ANALYSIS_API_TOKEN: 'synthetic-token',
    VIDEO_ALLOW_LOCAL_TEST_URLS: 'false', VIDEO_ALLOWED_HOSTS: 'storage.example.invalid',
  });
  t.after(() => { process.env = saved; });
}

async function serve(t, app) {
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return (path, { authorized = true, method = 'POST', body = {} } = {}) => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: 'Bearer synthetic-token' } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
}

test('hosted service restricts routes and rejects unauthorized or invalid media without inference', async t => {
  configure(t);
  const send = await serve(t, createHostedAnalysisApp());
  assert.equal((await send('/healthz', { method: 'GET', authorized: false })).status, 200);
  assert.equal((await send('/api/analyze-video', { authorized: false })).status, 401);
  const invalid = await send('/api/analyze-video', { body: { fileUrl: 'https://not-allowed.invalid/video.mp4' } });
  assert.equal(invalid.status, 422);
  assert.equal((await invalid.json()).code, 'invalid_video');
  for (const [path, method] of [['/', 'GET'], ['/api/analyze-video', 'GET'], ['/api/upload-video', 'POST'],
    ['/api/r2-presign-upload', 'POST'], ['/api/analyze-video-case', 'POST'], ['/api/analyze-video-aggregate', 'POST']]) {
    assert.equal((await send(path, { method })).status, 404, `${method} ${path}`);
  }
});

test('only one media operation runs while health and auth remain available, and completion releases capacity', async t => {
  configure(t);
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  let rejectNext = false;
  // Slow media/remote inference boundary; HTTP/auth/admission handling is real.
  const analyze = async ({ fileName }) => {
    entered();
    await pending;
    if (rejectNext) throw Object.assign(new Error('synthetic quota rejection'), { status: 503, code: 'ai_quota_exceeded' });
    return { status: 'analyzed', fileName, analysis: { evaluation: {} } };
  };
  const send = await serve(t, createHostedAnalysisApp({ analyze }));
  const first = send('/api/analyze-video', { body: { fileName: 'first.m4v' } });
  await started;
  assert.equal((await send('/healthz', { method: 'GET' })).status, 200);
  assert.equal((await send('/api/analyze-video', { authorized: false })).status, 401);
  const busy = await send('/api/analyze-video');
  assert.equal(busy.status, 503);
  assert.equal((await busy.json()).code, 'analysis_busy');
  finish();
  assert.equal((await (await first).json()).fileName, 'first.m4v');
  rejectNext = true;
  assert.equal((await send('/api/analyze-video')).status, 503);
  rejectNext = false;
  assert.equal((await send('/api/analyze-video')).status, 200);
});

test('unexpected failures are sanitized and do not prevent the next operation', async t => {
  configure(t);
  const send = await serve(t, createHostedAnalysisApp({ analyze: async () => {
    throw new Error('secret=https://storage.invalid/video?token=private-key');
  } }));
  for (let i = 0; i < 2; i++) {
    const response = await send('/api/analyze-video');
    assert.equal(response.status, 502);
    const text = await response.text();
    assert.match(text, /analysis_failed/);
    assert.doesNotMatch(text, /private-key|storage.invalid|secret=/);
  }
});

test('a disconnected client cannot release capacity while its analysis is still computing', async t => {
  configure(t);
  let entered, finish;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { finish = resolve; });
  const send = await serve(t, createHostedAnalysisApp({ analyze: async () => {
    entered(); await pending; return { status: 'analyzed' };
  } }));
  // Abort a real HTTP request after the server has entered the long-running operation.
  const server = createServer(createHostedAnalysisApp({ analyze: async () => {
    entered(); await pending; return { status: 'analyzed' };
  } }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/analyze-video`;
  const controller = new AbortController();
  const request = options => fetch(url, { method: 'POST', headers: { Authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json' }, body: '{}', ...options });
  const abandoned = request({ signal: controller.signal }).catch(error => error.name);
  await started;
  controller.abort();
  assert.equal(await abandoned, 'AbortError');
  assert.equal((await request()).status, 503);
  finish();
  assert.equal((await request()).status, 200);
  // The independent listener is not affected by the other listener's reservation.
  assert.equal((await send('/api/analyze-video')).status, 200);
});

test('hosted startup fails closed on missing auth, unsafe sources or another provider', async t => {
  configure(t);
  delete process.env.ANALYSIS_API_TOKEN;
  await assert.rejects(startHostedAnalysisServer({ port: 0 }), /ANALYSIS_API_TOKEN/);
  process.env.ANALYSIS_API_TOKEN = 'synthetic-token';
  process.env.VIDEO_ALLOW_LOCAL_TEST_URLS = 'true';
  await assert.rejects(startHostedAnalysisServer({ port: 0 }), /VIDEO_ALLOW_LOCAL_TEST_URLS/);
  process.env.VIDEO_ALLOW_LOCAL_TEST_URLS = 'false';
  process.env.VIDEO_ANALYSIS_PROVIDER = 'openai';
  await assert.rejects(startHostedAnalysisServer({ port: 0 }), /gemini/);
  process.env.VIDEO_ANALYSIS_PROVIDER = 'gemini';
  process.env.GEMINI_MODEL = 'gemini-other';
  await assert.rejects(startHostedAnalysisServer({ port: 0 }), /gemini-2.5-flash/);
});
