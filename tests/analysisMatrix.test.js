import test from 'node:test';
import assert from 'node:assert/strict';
import * as statistics from '../src/services/aggregateStatistics.js';

test('combining reads nested and legacy quality scores as records', () => {
  assert.deepEqual(statistics.getAnalysisMatrix({analysis:{quality_scores:{a:3}}}),{a:3});
  assert.deepEqual(statistics.getAnalysisMatrix({quality_scores:{a:5}}),{a:5});
});
test('combining ignores malformed AI matrices instead of forwarding primitives or arrays', () => {
  for (const output of [null,{}, {quality_scores:5}, {quality_scores:[]}, {analysis:{quality_scores:'bad'}}]) {
    assert.deepEqual(statistics.getAnalysisMatrix(output),{});
  }
});
