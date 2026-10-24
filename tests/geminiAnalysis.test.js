import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unavailableEvaluation } from './helpers/videoEvaluationFixture.js';
import { generateVideoAnalysis } from '../server/videoAnalysisProvider.js';
import { analyzeVideoFromUrl, analyzeVideoCaseAggregate } from '../server/videoAnalysisCore.js';

async function setup(t) {
  const saved = { ...process.env };
  const dir = await mkdtemp(join(tmpdir(), 'via-gemini-test-'));
  Object.assign(process.env, { VIDEO_ANALYSIS_PROVIDER: 'gemini', GEMINI_API_KEY: 'private-test-key',
    GEMINI_MODEL: 'gemini-3.8-flash', AI_ANALYSIS_CACHE_DIR: dir });
  delete process.env.OPENAI_API_KEY;
  delete process.env.DASHSCOPE_API_KEY;
  t.after(async () => { process.env = saved; await rm(dir, { recursive: true, force: true }); });
}
const completed = text => ({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10, totalTokenCount: 30 } });

test('Gemini video provider consumes supplied JPEG and MP3 together and caches only validated JSON', async t => {
  await setup(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    assert.equal(options.headers['x-goog-api-key'], 'private-test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.deepEqual(body.contents[0].parts.slice(1), [
      { inlineData: { mimeType: 'image/jpeg', data: 'aW1hZ2U=' } },
      { inlineData: { mimeType: 'audio/mpeg', data: 'YXVkaW8=' } },
    ]);
    calls++;
    return Response.json(completed(JSON.stringify(unavailableEvaluation())));
  });
  const input = { prompt: 'Return JSON.', frames: [{ base64: 'aW1hZ2U=' }], audio: { base64: 'YXVkaW8=' } };
  const result = await generateVideoAnalysis(input);
  assert.equal(result.provider, 'gemini');
  assert.equal(result.audioModel, 'gemini-3.8-flash');
  assert.deepEqual(result.parsed, unavailableEvaluation());
  assert.equal(result.usage.vision.totalTokenCount, 30);
  assert.equal((await generateVideoAnalysis(input)).cache.visionHit, true);
  assert.equal(calls, 1);
  process.env.GEMINI_API_KEY = 'another-account-key';
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json(completed(JSON.stringify(unavailableEvaluation()))); });
  assert.equal((await generateVideoAnalysis(input)).cache.visionHit, false);
  assert.equal(calls, 2);
});

test('missing Gemini key and invalid model fail before downloading media without provider fallback', async t => {
  await setup(t);
  process.env.OPENAI_API_KEY = 'available-but-not-selected';
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(analyzeVideoFromUrl({ fileUrl: 'https://untrusted.invalid/video' }), /GEMINI_API_KEY/);
  process.env.GEMINI_API_KEY = 'private-test-key';
  process.env.GEMINI_MODEL = 'bad/model?key=secret';
  await assert.rejects(analyzeVideoFromUrl({ fileUrl: 'https://untrusted.invalid/video' }), /GEMINI_MODEL/);
});

test('blocked, truncated, thought-only and malformed Gemini results never become successful analyses', async t => {
  await setup(t);
  const fixtures = [
    { promptFeedback: { blockReason: 'SAFETY' } },
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}', thought: true }] } }] },
    completed('not json'), completed('[]'), completed('null'),
  ];
  for (let i = 0; i < fixtures.length; i++) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(fixtures[i]));
    await assert.rejects(generateVideoAnalysis({ prompt: `JSON ${i}` }), /Gemini analysis/);
    t.mock.method(globalThis, 'fetch', async () => Response.json(completed(JSON.stringify(unavailableEvaluation()))));
    assert.equal((await generateVideoAnalysis({ prompt: `JSON ${i}` })).cache.visionHit, false);
  }
});

test('Gemini quota errors keep key/source private and do not retry automatically', async t => {
  await setup(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ error: {
    message: 'private-test-key signed-url private-content' } }, { status: 429 }); });
  await assert.rejects(generateVideoAnalysis({ prompt: 'JSON' }), error => {
    assert.match(error.message, /Gemini request failed.*429/);
    assert.doesNotMatch(error.message, /private-test-key|signed-url|private-content/);
    return true;
  });
  assert.equal(calls, 1);
});

test('Gemini network or server uncertainty prevents blind replay', async t => {
  await setup(t);
  for (const mode of ['network', 'server', 'broken-response']) {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      if (mode === 'network') throw new Error('private transport detail');
      return new Response('private malformed data', { status: mode === 'server' ? 503 : 200 });
    });
    await assert.rejects(generateVideoAnalysis({ prompt: mode }), error => error.deliveryUnknown === true);
    await assert.rejects(generateVideoAnalysis({ prompt: mode }), /already running|inspection/);
    assert.equal(calls, 1);
  }
});

test('Gemini missing audio is explicit and the aggregate step still uses its existing provider', async t => {
  await setup(t);
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.match(body.contents[0].parts[0].text, /No audio.*Do not infer/s);
    return Response.json(completed(JSON.stringify(unavailableEvaluation())));
  });
  assert.equal((await generateVideoAnalysis({ prompt: 'JSON' })).audioModel, null);
  process.env.OPENAI_API_KEY = 'existing-provider-key';
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{}' }] }] });
  });
  assert.equal((await analyzeVideoCaseAggregate({ caseKey: 'case', analyses: [{ rubric: {} }] })).provider, 'openai');
});


test('Gemini rejects invalid evaluation categories, rating ranges/types and explanations before caching', async t => {
  await setup(t);
  const cases = [
    value => { delete value.evaluation.audio; },
    value => { value.evaluation.audio.rating = 0; },
    value => { value.evaluation.audio.rating = 6; },
    value => { value.evaluation.audio.rating = '3'; },
    value => { value.evaluation.audio.rating = 2.5; },
    value => { value.evaluation.audio.comment = ' '; },
    value => { value.evaluation.overall_impression.summary = null; },
    value => { value.evaluation.camera_angles = []; },
    value => { value.evaluation.unexpected = { rating: 3, comment: 'extra' }; },
    value => { value.summary = 'legacy extra shape'; },
  ];
  for (let i = 0; i < cases.length; i++) {
    const value = unavailableEvaluation();
    cases[i](value);
    t.mock.method(globalThis, 'fetch', async () => Response.json(completed(JSON.stringify(value))));
    await assert.rejects(generateVideoAnalysis({ prompt: `schema ${i}`, frames: [{base64:'YQ=='}], audio:{base64:'YQ=='} }), error => error.code === 'invalid_ai_response');
  }
});

test('Gemini cannot return audio scores when audio extraction is unavailable', async t => {
  await setup(t);
  for (const category of ['audio', 'script_narration']) {
    const value = unavailableEvaluation();
    value.evaluation[category].rating = 4;
    t.mock.method(globalThis, 'fetch', async () => Response.json(completed(JSON.stringify(value))));
    await assert.rejects(generateVideoAnalysis({ prompt: category, frames: [{base64:'YQ=='}] }), /unavailable audio/i);
  }
});

test('Gemini cannot invent visual scores without frames', async t => {
  await setup(t);
  const value = unavailableEvaluation();
  value.evaluation.camera_angles.rating = 4;
  t.mock.method(globalThis, 'fetch', async () => Response.json(completed(JSON.stringify(value))));
  await assert.rejects(generateVideoAnalysis({prompt:'No image',audio:{base64:'YQ=='}}), /unavailable visual/i);
});

test('Gemini sends an authoritative evaluation schema even for a custom legacy prompt', async t => {
  await setup(t);
  const value = unavailableEvaluation();
  value.evaluation.audio = { rating: 1, comment: 'Clipped and noisy.' };
  value.evaluation.graphics = { rating: 5, comment: 'Readable text.' };
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body);
    const schema = body.generationConfig.responseJsonSchema;
    assert.deepEqual(schema.required, ['evaluation']);
    assert.equal(schema.properties.evaluation.properties.audio.properties.rating.minimum, 1);
    assert.equal(schema.properties.evaluation.properties.audio.properties.rating.maximum, 5);
    assert.match(body.systemInstruction.parts[0].text, /1.*5/);
    return Response.json(completed(JSON.stringify(value)));
  });
  const result = await generateVideoAnalysis({prompt:'Return legacy summary only',frames:[{base64:'YQ=='}],audio:{base64:'YQ=='}});
  assert.equal(result.parsed.evaluation.audio.rating, 1);
  assert.equal(result.parsed.evaluation.graphics.rating, 5);
});

test('Gemini classifies billing, authentication and quota errors without exposing provider text', async t => {
  await setup(t);
  for (const [status, code, expected] of [[401,'ai_auth_failed',502],[403,'ai_auth_failed',502],[402,'ai_billing_required',503],[429,'ai_quota_exceeded',503]]) {
    t.mock.method(globalThis, 'fetch', async () => new Response('private-test-key', {status}));
    await assert.rejects(generateVideoAnalysis({prompt:`status ${status}`}), error => {
      assert.equal(error.code, code);
      assert.equal(error.status, expected);
      assert.doesNotMatch(error.message, /private-test-key/);
      return true;
    });
  }
});
