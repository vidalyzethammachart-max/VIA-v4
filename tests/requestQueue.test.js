import test from 'node:test';
import assert from 'node:assert/strict';
import { retryDecision, classifyWorkflowResponse } from '../server/requestQueuePolicy.js';

test('rate limits respect server retry delay and use increasing bounded delay', () => {
  assert.equal(retryDecision({status:429, attempt:1, retryAfter:'120', now:0}).delayMs,120000);
  assert.equal(retryDecision({status:429, attempt:3, now:0}).delayMs,240000);
  assert.equal(retryDecision({status:429, attempt:5, now:0}).state,'failed');
});
test('daily quota waits for a daily reset; permission errors are terminal', () => {
  assert.equal(retryDecision({status:429,attempt:1,body:'GenerateRequestsPerDayPerProjectPerModel',now:0}).delayMs,86400000);
  assert.equal(retryDecision({status:403,attempt:1,now:0}).state,'failed');
});
test('accepted webhook is not a completed document and transport ambiguity is not replayed', () => {
  assert.equal(classifyWorkflowResponse({status:200,body:'{"message":"Workflow was started"}',documentReady:false}),'awaiting_callback');
  assert.equal(classifyWorkflowResponse({status:500,body:'error',documentReady:true}),'completed');
  assert.equal(retryDecision({status:0,attempt:1,now:0}).state,'attention');
});
test('only transient server errors are retried and provider delay is never shortened', () => {
  assert.equal(retryDecision({status:400,attempt:1,now:0}).state,'failed');
  assert.equal(retryDecision({status:503,attempt:1,retryAfter:'600',now:0}).delayMs,600000);
  assert.equal(retryDecision({status:429,attempt:1,body:'"retryDelay":"90s"',now:0}).delayMs,90000);
});
