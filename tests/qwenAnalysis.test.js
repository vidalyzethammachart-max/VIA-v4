import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import { analyzeVideoFromUrl, analyzeVideoCaseAggregate } from '../server/videoAnalysisCore.js';
import { aggregateVideoCaseAnalyses } from '../server/videoCaseAggregateCore.js';

async function setup(t) {
  const saved = { ...process.env };
  const directory = await mkdtemp(join(tmpdir(), 'via-qwen-test-'));
  Object.assign(process.env, {
    VIDEO_ANALYSIS_PROVIDER: 'qwen', DASHSCOPE_API_KEY: 'private-test-key',
    DASHSCOPE_BASE_URL: 'https://test-workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
    QWEN_MODEL: 'qwen3.8-omni-flash', AI_ANALYSIS_CACHE_DIR: directory,
    VIDEO_ALLOW_LOCAL_TEST_URLS: 'true',
  });
  delete process.env.OPENAI_API_KEY;
  t.after(async () => { process.env = saved; await rm(directory, { recursive: true, force: true }); });
  return directory;
}

const complete = text => ({ model: 'qwen3.8-omni-flash', choices: [
  { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: text } },
], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });

test('Qwen consumes real MP3 and sampled images, returns JSON and reuses validated evidence', async t => {
  await setup(t);
  // A wrong endpoint, omitted audio or cached invalid result breaks this contract.
  const { generateVideoAnalysis } = await import('../server/videoAnalysisProvider.js');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://test-workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer private-test-key');
    const body = JSON.parse(options.body);
    calls.push(body);
    return Response.json(complete(body.messages[0].content.some(item => item.type === 'input_audio')
      ? 'Clear speech, steady pacing.' : '{"summary":"Evidence assessed"}'));
  });
  const input = { prompt: 'Return JSON.', frames: [{ base64: 'aW1hZ2U=' }], audio: { base64: 'YXVkaW8=' } };
  const result = await generateVideoAnalysis(input);
  assert.deepEqual(result.parsed, { summary: 'Evidence assessed' });
  assert.equal(result.provider, 'qwen');
  assert.equal(result.audioModel, 'qwen3.8-omni-flash');
  assert.deepEqual(result.usage.audio, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
  assert.equal(calls[0].messages[0].content[1].input_audio.data, 'data:audio/mpeg;base64,YXVkaW8=');
  assert.equal(calls[0].messages[0].content[1].input_audio.format, 'mp3');
  assert.equal(calls[1].messages[0].content[1].image_url.url, 'data:image/jpeg;base64,aW1hZ2U=');
  assert.match(calls[1].messages[0].content[0].text, /Clear speech, steady pacing/);
  assert.deepEqual(calls[1].response_format, { type: 'json_object' });
  assert.equal(calls[1].stream, false);
  assert.equal(calls[1].reasoning_effort, 'none');
  const cached = await generateVideoAnalysis(input);
  assert.deepEqual(cached.cache, { visionHit: true, audioHit: true });
  assert.equal(calls.length, 2);
  process.env.DASHSCOPE_BASE_URL = 'https://other-workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
  t.mock.method(globalThis, 'fetch', async () => Response.json(complete('{"summary":"Other workspace"}')));
  const other = await generateVideoAnalysis({ prompt: 'Return JSON.' });
  assert.equal(other.cache.visionHit, false);
});

test('Qwen fails before media download when key or regional endpoint is missing; never falls back', async t => {
  await setup(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('must not fetch'); });
  delete process.env.DASHSCOPE_API_KEY;
  process.env.OPENAI_API_KEY = 'available-but-not-selected';
  await assert.rejects(analyzeVideoFromUrl({ fileUrl: 'https://untrusted.invalid/video' }), /DASHSCOPE_API_KEY/);
  process.env.DASHSCOPE_API_KEY = 'private-test-key';
  delete process.env.DASHSCOPE_BASE_URL;
  await assert.rejects(analyzeVideoFromUrl({ fileUrl: 'https://untrusted.invalid/video' }), /DASHSCOPE_BASE_URL/);
  process.env.DASHSCOPE_BASE_URL = 'https://evil.invalid/compatible-mode/v1';
  await assert.rejects(analyzeVideoFromUrl({ fileUrl: 'https://untrusted.invalid/video' }), /endpoint/i);
  process.env.VIDEO_ANALYSIS_PROVIDER = 'typo';
  await assert.rejects(analyzeVideoFromUrl({ fileUrl: 'https://untrusted.invalid/video' }), /VIDEO_ANALYSIS_PROVIDER/);
  assert.equal(calls, 0);
});

test('Qwen rejects incomplete, non-object and invalid JSON output instead of caching success', async t => {
  await setup(t);
  const { generateVideoAnalysis } = await import('../server/videoAnalysisProvider.js');
  for (const [label, payload] of [
    ['truncated', { ...complete('{}'), choices: [{ finish_reason: 'length', message: { content: '{}' } }] }],
    ['invalid', complete('not JSON')], ['array', complete('[]')], ['empty', complete('')],
  ]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(payload));
    await assert.rejects(generateVideoAnalysis({ prompt: label }), /Qwen analysis/);
    t.mock.method(globalThis, 'fetch', async () => Response.json(complete('{"ok":true}')));
    const retry = await generateVideoAnalysis({ prompt: label });
    assert.equal(retry.cache.visionHit, false);
    assert.equal(retry.parsed.ok, true);
  }
});

test('Qwen quota failures are sanitized and audio is not silently omitted', async t => {
  await setup(t);
  const { generateVideoAnalysis } = await import('../server/videoAnalysisProvider.js');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return Response.json({ error: { code: 'QuotaExceeded', message: 'private-test-key secret-url source-text' } }, { status: 429 });
  });
  await assert.rejects(generateVideoAnalysis({ prompt: 'JSON', audio: { base64: 'YQ==' } }), error => {
    assert.match(error.message, /Qwen request failed.*429/);
    assert.doesNotMatch(error.message, /private-test-key|secret-url|source-text/);
    return true;
  });
  assert.equal(calls, 1);
});

test('unknown Qwen transport outcome keeps duplicate guard until inspected', async t => {
  await setup(t);
  const { generateVideoAnalysis } = await import('../server/videoAnalysisProvider.js');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('private transport details'); });
  await assert.rejects(generateVideoAnalysis({ prompt: 'JSON' }), error => error.deliveryUnknown === true);
  await assert.rejects(generateVideoAnalysis({ prompt: 'JSON' }), /already running|inspection/);
  assert.equal(calls, 1);
});

test('video-only provider choice leaves both existing aggregate paths on OpenAI', async t => {
  await setup(t);
  process.env.OPENAI_API_KEY = 'test-openai';
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    return Response.json({ status: 'completed', output: [
      { type: 'message', content: [{ type: 'output_text', text: '{"summary":"Existing aggregate"}' }] },
    ] });
  });
  const current = await aggregateVideoCaseAnalyses({ caseId: 'case', sourceRuns: [{ rubric: {} }] });
  const legacy = await analyzeVideoCaseAggregate({ caseKey: 'case', analyses: [{ rubric: {} }] });
  assert.equal(current.provider, 'openai');
  assert.equal(legacy.provider, 'openai');
});

test('real ffmpeg media extraction reaches Qwen while retaining Analyze Video response contract', async t => {
  const directory = await setup(t);
  const mediaPath = join(directory, 'test.mp4');
  await promisify(execFile)(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=10:d=3',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', mediaPath], { timeout: 15000 });
  const media = await readFile(mediaPath);
  const server = createServer((_req, res) => { res.writeHead(200, { 'Content-Length': media.length }); res.end(media); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(url, /maas\.aliyuncs\.com/);
    const content = JSON.parse(options.body).messages[0].content;
    calls++;
    const audio = content.find(item => item.type === 'input_audio');
    if (audio) assert.ok(audio.input_audio.data.length > 100);
    else assert.ok(content.filter(item => item.type === 'image_url').length >= 3);
    return Response.json(complete(audio ? 'Test tone; no speech.' : '{"summary":"Blue frames and tone"}'));
  });
  const result = await analyzeVideoFromUrl({ fileName: 'test.mp4', fileUrl: `http://127.0.0.1:${server.address().port}/test.mp4` });
  assert.equal(result.status, 'analyzed');
  assert.equal(result.provider, 'qwen');
  assert.equal(result.downloadedBytes, media.length);
  assert.ok(result.audioBytes > 0);
  assert.equal(result.analysis.summary, 'Blue frames and tone');
  assert.equal(calls, 2);
});
