import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as access from '../supabase/functions/_shared/groupDocumentAccess.js';
import * as roleAccess from '../supabase/functions/_shared/roleAccess.js';

const G = '71abc689-868a-4bc7-a0b0-000000000001';
const A = '61abc689-868a-4bc7-a0b0-000000000000';

function setup({ role = 'user', userId = 'u1', group = null, sources = [], memberships = [], aggregate = null } = {}) {
  let handler;
  const queries = [];
  const signed = [];
  const admin = {
    from(table) {
      const q = { table, filters: [], select() { return q; },
        eq(col, val) { q.filters.push(['eq', col, val]); return q; },
        in(col, val) { q.filters.push(['in', col, val]); return q; },
        async maybeSingle() {
          queries.push(q);
          if (table === 'user_information') return { data: { role }, error: null };
          if (table === 'video_group_evaluations') return { data: q.filters.some(f => f[2] === G) ? group : null, error: null };
          if (table === 'video_case_aggregates') return { data: aggregate, error: null };
          return { data: null, error: null };
        },
        then(resolve) {
          queries.push(q);
          const data = table === 'video_group_evaluation_sources' ? sources
            : table === 'video_case_members' ? memberships : [];
          resolve({ data, error: null });
        } };
      return q;
    },
    storage: { from: () => ({ createSignedUrl: async (path) => { signed.push(path); return { data: { signedUrl: `https://signed/${path}` }, error: null }; } }) },
  };
  const auth = { auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) } };
  const source = readFileSync(new URL('../supabase/functions/document-artifact-url/index.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  runInNewContext(compiled, { exports: {}, Response, console, Promise, Deno: { env: { get: k => env[k] } }, require(name) {
    if (name.includes('/http/server.ts')) return { serve: fn => { handler = fn; } };
    if (name.includes('@supabase/supabase-js')) return { createClient: (_u, key) => key === 'service' ? admin : auth };
    if (name.endsWith('groupDocumentAccess.js')) return access;
    if (name.endsWith('roleAccess.js')) return roleAccess;
    throw new Error(name);
  } });
  const call = body => handler(new Request('https://x.invalid', { method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { call, queries, signed };
}

const grp = { id: G, requested_by: 'owner', pdf_storage_path: 'groups/g.pdf', docx_storage_path: 'groups/g.docx' };
const sources = [{ video_case_id: 'c1' }, { video_case_id: 'c2' }];

async function assertOk(r) {
  assert.equal(r.status, 200);
  const json = await r.json();
  assert.equal(json.pdfUrl, 'https://signed/groups/g.pdf');
  assert.equal(json.docxUrl, 'https://signed/groups/g.docx');
}

test('admin reads a group document without membership lookups', async () => {
  const { call, queries, signed } = setup({ role: 'admin', group: grp, sources });
  await assertOk(await call({ aggregateId: G }));
  assert.deepEqual(signed, ['groups/g.pdf', 'groups/g.docx']);
  assert.equal(queries.some(q => q.table === 'video_case_members'), false);
});

test('the requester reads their group document', async () => {
  const { call } = setup({ userId: 'owner', group: grp, sources });
  await assertOk(await call({ aggregateId: G }));
});

test('a source-case member reads it; queries are wired by group id and source case ids', async () => {
  const { call, queries } = setup({ userId: 'm', group: grp, sources, memberships: [{ video_case_id: 'c2' }] });
  await assertOk(await call({ aggregateId: G }));
  const tables = queries.map(q => q.table);
  assert.ok(tables.includes('video_group_evaluations'));
  assert.equal(tables.includes('video_case_aggregates'), false, 'group is checked before, and instead of, the aggregate table');
  const src = queries.find(q => q.table === 'video_group_evaluation_sources');
  assert.deepEqual(src.filters, [['eq', 'group_id', G]]);
  const mem = queries.find(q => q.table === 'video_case_members');
  assert.ok(mem.filters.some(f => f[0] === 'in' && f[1] === 'video_case_id' && f[2].join() === 'c1,c2'));
  assert.ok(mem.filters.some(f => f[0] === 'eq' && f[1] === 'user_id' && f[2] === 'm'));
});

test('a non-member who is neither requester nor admin gets 403 and nothing is signed', async () => {
  const { call, signed } = setup({ userId: 'x', group: grp, sources, memberships: [] });
  assert.equal((await call({ aggregateId: G })).status, 403);
  assert.deepEqual(signed, []);
});

test('an unknown group id falls through to the legacy aggregate path', async () => {
  const agg = { id: A, video_case_id: 'vc1', pdf_storage_path: 'agg/a.pdf', docx_storage_path: null };
  const { call, queries, signed } = setup({ role: 'admin', group: null, aggregate: agg });
  const r = await call({ aggregateId: A });
  assert.equal(r.status, 200);
  assert.deepEqual(signed, ['agg/a.pdf']);
  const tables = queries.map(q => q.table);
  assert.ok(tables.indexOf('video_group_evaluations') < tables.indexOf('video_case_aggregates'));
});

test('a super admin reads a group document like an admin, without membership lookups', async () => {
  const { call, queries, signed } = setup({ role: 'super_admin', group: grp, sources });
  await assertOk(await call({ aggregateId: G }));
  assert.deepEqual(signed, ['groups/g.pdf', 'groups/g.docx']);
  assert.equal(queries.some(q => q.table === 'video_case_members'), false);
});
