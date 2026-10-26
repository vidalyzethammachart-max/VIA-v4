import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeVideoCaseAggregate } from '../server/videoAnalysisCore.js';
import { aggregateVideoCaseAnalyses } from '../server/videoCaseAggregateCore.js';
import { generateOpenAiAnalysis } from '../server/openAiAnalysis.js';
import { analyzeVideoFromUrl } from '../server/videoAnalysisCore.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';

function configure(t) {
  const saved = { ...process.env };
  const cache = mkdtempSync(join(tmpdir(), 'via-cache-test-'));
  process.env.AI_ANALYSIS_CACHE_DIR = cache;
  process.env.VIDEO_ALLOW_LOCAL_TEST_URLS = 'true';
  process.env.OPENAI_API_KEY = 'test-key-not-real';
  process.env.OPENAI_MODEL = 'gpt-4.1-mini';
  delete process.env.GEMINI_API_KEY;
  t.after(() => { process.env = saved; rmSync(cache, {recursive:true,force:true}); });
}

function mockResponse(t, payload) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return Response.json(payload);
  });
  return requests;
}

const completed = (text) => ({ status: 'completed', output: [
  { type: 'reasoning', summary: [] },
  { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
] });

test('case aggregation uses OpenAI and preserves fractional averages and source data', async t => {
  configure(t);
  const requests = mockResponse(t, completed('{"summary":"Combined evidence"}'));
  const sourceRuns = [
    { id: 'one', rubric: { a: { q1: 1 } }, notes: 'First reviewer' },
    { id: 'two', rubric: { a: { q1: 5 } }, notes: 'Second reviewer' },
  ];
  const before = structuredClone(sourceRuns);
  const result = await aggregateVideoCaseAnalyses({ caseId: 'case', sourceRuns });
  assert.equal(result.model, 'gpt-4.1-mini');
  assert.equal(result.aggregatedScores.a.q1, 3);
  assert.equal(result.analysis.summary, 'Combined evidence');
  assert.deepEqual(sourceRuns, before);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-key-not-real');
  assert.equal(requests[0].body.store, false);
  assert.match(JSON.stringify(requests[0].body.input), /First reviewer/);
});

test('legacy aggregate endpoint also uses OpenAI without needing a Gemini key', async t => {
  configure(t);
  const requests = mockResponse(t, completed('{"summary":"Legacy compatible"}'));
  const result = await analyzeVideoCaseAggregate({ caseKey: 'case', analyses: [
    { rubric: { a: { q1: 1 } } }, { rubric: { a: { q1: 4 } } },
  ] });
  assert.equal(result.averageRubric.a.q1, 2.5);
  assert.equal(result.analysis.summary, 'Legacy compatible');
  assert.equal(requests[0].body.model, 'gpt-4.1-mini');
});

test('an incomplete OpenAI result is rejected instead of stored as an analysis', async t => {
  configure(t);
  mockResponse(t, { ...completed('{"summary":"partial"}'), status: 'incomplete' });
  await assert.rejects(aggregateVideoCaseAnalyses({ caseId: 'case', sourceRuns: [{ rubric: {} }] }), /incomplete/i);
});

test('missing OpenAI credentials fail before making a request', async t => {
  configure(t);
  delete process.env.OPENAI_API_KEY;
  const requests = mockResponse(t, completed('{}'));
  await assert.rejects(aggregateVideoCaseAnalyses({ caseId: 'case', sourceRuns: [{}] }), /OPENAI_API_KEY/);
  assert.equal(requests.length, 0);
});

test('report retry and simultaneous identical requests reuse completed AI output', async t => {
  configure(t);
  const requests = mockResponse(t, {...completed('{"summary":"cached"}'),usage:{input_tokens:100,output_tokens:20}});
  const input = {prompt:'Return JSON evidence.',frames:[{base64:'aW1hZ2U='}]};
  const results = await Promise.all([generateOpenAiAnalysis(input),generateOpenAiAnalysis(input)]);
  const again = await generateOpenAiAnalysis(input);
  assert.equal(requests.length,1);
  assert.equal(again.parsed.summary,results[0].parsed.summary);
  assert.equal(again.cache.visionHit,true);
  assert.equal(again.usage.vision.input_tokens,100);
  assert.equal(again.provider,'openai');
  assert.ok(again.promptVersion);
  assert.equal(again.estimatedCostUsd,null);
});

test('a failed final inference reuses earlier successful audio assessment', async t => {
  configure(t);
  let audioCalls=0, visionCalls=0;
  t.mock.method(globalThis,'fetch',async url => {
    if(url.endsWith('/chat/completions')) {
      audioCalls++;
      return Response.json({choices:[{finish_reason:'stop',message:{content:'Actual audio evidence'}}],usage:{prompt_tokens:5}});
    }
    visionCalls++;
    return visionCalls===1 ? Response.json({error:{code:'rate_limit_exceeded'}},{status:429}) : Response.json(completed('{"summary":"ok"}'));
  });
  const input={prompt:'JSON',audio:{base64:'YQ=='}};
  await assert.rejects(generateOpenAiAnalysis(input),/429/);
  const result=await generateOpenAiAnalysis(input);
  assert.equal(audioCalls,1);
  assert.equal(visionCalls,2);
  assert.equal(result.cache.audioHit,true);
});

test('media sends actual audio for acoustic assessment and images for vision', async t => {
  configure(t);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({url, body});
    return Response.json(url.endsWith('/chat/completions')
      ? { choices: [{ finish_reason: 'stop', message: { content: 'Clear Thai narration with quiet background.' } }] }
      : completed('{"summary":"Video evidence"}'));
  });
  const result = await generateOpenAiAnalysis({ prompt: 'Return JSON.', frames: [{base64:'aW1hZ2U='}], audio: {base64:'YXVkaW8='} });
  assert.equal(calls[0].body.messages[0].content[1].input_audio.data, 'YXVkaW8=');
  assert.equal(calls[1].body.input[0].content[1].image_url, 'data:image/jpeg;base64,aW1hZ2U=');
  assert.match(calls[1].body.input[0].content[0].text, /Clear Thai narration/);
  assert.equal(result.audioModel, 'gpt-audio-mini');
});

test('upstream failure does not expose provider content or silently downgrade audio', async t => {
  configure(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response('private source and signed URL', {status:429});
  });
  await assert.rejects(generateOpenAiAnalysis({prompt:'JSON',audio:{base64:'YQ=='}}), error => {
    assert.match(error.message, /HTTP 429/);
    assert.doesNotMatch(error.message, /private source/);
    return true;
  });
  assert.equal(calls, 1);
});

test('refusal or invalid JSON is not accepted as a completed analysis', async t => {
  configure(t);
  mockResponse(t, completed('not JSON'));
  await assert.rejects(generateOpenAiAnalysis({prompt:'JSON'}), /invalid JSON/);
});

test('exhausted API credit is reported distinctly without exposing provider details', async t => {
  configure(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({error:{
    code:'credit_balance_exhausted',type:'insufficient_quota',message:'private billing details',
  }},{status:429}));
  await assert.rejects(generateOpenAiAnalysis({prompt:'JSON'}), error => {
    assert.match(error.message, /credit_balance_exhausted/);
    assert.match(error.message, /API credit balance is exhausted/);
    assert.equal(error.code, 'ai_billing_required');
    assert.equal(error.status, 503);
    assert.doesNotMatch(error.message, /private billing/);
    return true;
  });
});

for (const [upstreamStatus, providerCode, expectedCode, expectedStatus] of [
  [429, 'insufficient_quota', 'ai_quota_exceeded', 503],
  [429, 'rate_limit_exceeded', 'ai_rate_limited', 503],
  [401, 'invalid_api_key', 'ai_auth_failed', 502],
  [403, null, 'ai_auth_failed', 502],
  [404, 'model_not_found', 'ai_model_unavailable', 502],
  [400, 'private-unknown-code', 'ai_request_rejected', 502],
]) {
  test(`OpenAI ${upstreamStatus}/${providerCode} has a safe distinct backend error`, async t => {
    configure(t);
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      return Response.json({ error: { code: providerCode, message: 'private signed URL and credentials' } }, { status: upstreamStatus });
    });
    await assert.rejects(generateOpenAiAnalysis({ prompt: 'JSON', audio: { base64: 'YQ==' } }), error => {
      assert.equal(error.code, expectedCode);
      assert.equal(error.status, expectedStatus);
      assert.doesNotMatch(error.message, /private|credentials/);
      return true;
    });
    assert.equal(calls, 1, 'A rejected audio request must not retry or proceed to vision');
  });
}

test('real ffmpeg extraction feeds OpenAI and retains the video endpoint contract', async t => {
  configure(t);
  const directory = await mkdtemp(join(tmpdir(), 'via-openai-test-'));
  let server;
  try {
    const file = join(directory, 'test.mp4');
    await promisify(execFile)(ffmpeg, ['-y','-f','lavfi','-i','color=c=blue:s=160x120:r=10:d=12',
      '-f','lavfi','-i','sine=frequency=440:duration=12','-c:v','libx264','-pix_fmt','yuv420p',
      '-c:a','aac','-shortest',file], {windowsHide:true,timeout:15000});
    const media = await readFile(file);
    server = createServer((_req,res) => {res.writeHead(200,{'Content-Length':media.length});res.end(media);});
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const calls = [];
    t.mock.method(globalThis,'fetch',async (url,options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      return Response.json(url.endsWith('/chat/completions')
        ? {choices:[{finish_reason:'stop',message:{content:'A sustained tone; no speech.'}}]}
        : completed('{"summary":"Blue frame and test tone","limitations":["sampled frames"]}'));
    });
    const result = await analyzeVideoFromUrl({fileName:'test.mp4',fileUrl:`http://127.0.0.1:${server.address().port}/test.mp4`});
    assert.equal(result.status,'analyzed');
    assert.equal(result.downloadedBytes,media.length);
    assert.ok(result.frameCount > 0);
    assert.ok(result.audioBytes > 0);
    assert.equal(result.analysis.summary,'Blue frame and test tone');
    assert.equal(calls.length,2);
    assert.doesNotMatch(JSON.stringify(calls), /http:\/\/127\.0\.0\.1/);
  } finally {
    if(server) await new Promise(resolve => server.close(resolve));
    await rm(directory,{recursive:true,force:true});
  }
});
