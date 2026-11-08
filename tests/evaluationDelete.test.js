import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyDeleteError,
  createDeleteEvaluationHandler,
  removablePaths,
  uniquePaths,
} from '../supabase/functions/_shared/evaluationDelete.js';

function request(body, { token = 'user-jwt', method = 'POST' } = {}) {
  return new Request('https://example.test/delete-evaluation', {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

function build(overrides = {}) {
  const calls = { removed: [], deleted: [] };
  const handler = createDeleteEvaluationHandler({
    authenticate: async () => ({ id: 'user-1' }),
    readEvaluation: async () => ({ id: 7, pdf_storage_path: 'a/report.pdf', docx_storage_path: 'a/report.docx' }),
    deleteAsUser: async (jwt, id) => { calls.deleted.push([jwt, id]); return { deletedCount: 1, error: null }; },
    findOtherReferences: async () => [],
    removeFiles: async (paths) => { calls.removed.push(paths); return paths.length; },
    ...overrides,
  });
  return { handler, calls };
}

test('deletes the row as the caller and then removes both document files', async () => {
  const { handler, calls } = build();
  const response = await handler(request({ evaluationId: 7 }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, reason: 'deleted', filesRemoved: 2, cleanupFailed: false });
  assert.deepEqual(calls.deleted, [['user-jwt', 7]]);
  assert.deepEqual(calls.removed, [['a/report.pdf', 'a/report.docx']]);
});

test('keeps the files when a combined summary still uses the evaluation', async () => {
  const { handler, calls } = build({
    deleteAsUser: async () => ({ deletedCount: 0, error: { code: '23503' } }),
  });
  const response = await handler(request({ evaluationId: 7 }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).reason, 'in_use');
  assert.deepEqual(calls.removed, []);
});

test('treats a delete that RLS filtered out as forbidden and keeps the files', async () => {
  const { handler, calls } = build({ deleteAsUser: async () => ({ deletedCount: 0, error: null }) });
  const response = await handler(request({ evaluationId: 7 }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).reason, 'forbidden');
  assert.deepEqual(calls.removed, []);
});

test('never removes a file that another evaluation or summary still references', async () => {
  const { handler, calls } = build({ findOtherReferences: async () => ['a/report.pdf'] });
  const response = await handler(request({ evaluationId: 7 }));
  assert.equal((await response.json()).filesRemoved, 1);
  assert.deepEqual(calls.removed, [['a/report.docx']]);
});

test('reports leftover files without failing when storage cleanup throws', async () => {
  const { handler } = build({ removeFiles: async () => { throw new Error('storage down'); } });
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await handler(request({ evaluationId: 7 }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, reason: 'deleted', filesRemoved: 0, cleanupFailed: true });
  } finally {
    console.error = originalError;
  }
});

test('skips storage entirely for an evaluation without documents', async () => {
  const { handler, calls } = build({ readEvaluation: async () => ({ id: 7, pdf_storage_path: null, docx_storage_path: ' ' }) });
  const response = await handler(request({ evaluationId: 7 }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls.removed, []);
});

test('rejects missing tokens, bad ids, unknown evaluations and other methods', async () => {
  const { handler } = build();
  assert.equal((await handler(request({ evaluationId: 7 }, { token: null }))).status, 401);
  assert.equal((await handler(request({ evaluationId: '7' }))).status, 400);
  assert.equal((await handler(request({ evaluationId: -1 }))).status, 400);
  assert.equal((await handler(request({}, { method: 'GET' }))).status, 405);
  const missing = build({ readEvaluation: async () => null }).handler;
  assert.equal((await missing(request({ evaluationId: 7 }))).status, 404);
  const anonymous = build({ authenticate: async () => null }).handler;
  assert.equal((await anonymous(request({ evaluationId: 7 }))).status, 401);
});

test('helpers drop blanks, dedupe and classify Postgres error codes', () => {
  assert.deepEqual(uniquePaths('a', 'a', '', null, ' b '), ['a', ' b ']);
  assert.deepEqual(removablePaths(['a', 'b'], ['b']), ['a']);
  assert.equal(classifyDeleteError({ code: '23503' }), 'in_use');
  assert.equal(classifyDeleteError({ code: '42501' }), 'forbidden');
  assert.equal(classifyDeleteError(null), 'delete_failed');
});
