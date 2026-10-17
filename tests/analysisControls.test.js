import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVideoSource, parseMediaDuration, analysisAccess } from '../server/analysisControls.js';

test('video downloads accept the configured R2 host and reject other destinations', () => {
  const env={R2_ACCOUNT_ID:'account'};
  assert.equal(validateVideoSource('https://account.r2.cloudflarestorage.com/bucket/file?signature=private',env).hostname,'account.r2.cloudflarestorage.com');
  for(const url of ['http://127.0.0.1/admin','https://evil.example/file','file:///etc/passwd','https://user:pass@account.r2.cloudflarestorage.com/file']) {
    assert.throws(()=>validateVideoSource(url,env));
  }
  assert.doesNotThrow(()=>validateVideoSource('http://127.0.0.1:123/test',{VIDEO_ALLOW_LOCAL_TEST_URLS:'true'}));
});

test('duration checks accept exactly 20 minutes and reject invalid or longer media', () => {
  assert.equal(parseMediaDuration('Duration: 00:20:00.00, start: 0',1200),1200);
  assert.throws(()=>parseMediaDuration('Duration: 00:20:00.01',1200),/20 minutes/);
  assert.throws(()=>parseMediaDuration('Duration: N/A',1200),/duration/);
});

test('analysis endpoints fail closed and require a server token', () => {
  assert.equal(analysisAccess('',{}),503);
  assert.equal(analysisAccess('Bearer wrong',{ANALYSIS_API_TOKEN:'correct-token'}),401);
  assert.equal(analysisAccess('Bearer correct-token',{ANALYSIS_API_TOKEN:'correct-token'}),200);
});
