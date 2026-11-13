import test from 'node:test';
import assert from 'node:assert/strict';
import { canReadGroupDocument } from '../supabase/functions/_shared/groupDocumentAccess.js';

const group={requested_by:'owner'};
test('admin can read any group document',()=>{
  assert.equal(canReadGroupDocument({role:'admin',userId:'x',group,sourceCaseIds:['c1'],memberCaseIds:[]}),true);
});
test('the requester can read their group document',()=>{
  assert.equal(canReadGroupDocument({role:'user',userId:'owner',group,sourceCaseIds:['c1'],memberCaseIds:[]}),true);
});
test('a member of any source case can read it',()=>{
  assert.equal(canReadGroupDocument({role:'user',userId:'m',group,sourceCaseIds:['c1','c2'],memberCaseIds:['c2','c9']}),true);
});
test('a non-creator who is in no source case is forbidden',()=>{
  assert.equal(canReadGroupDocument({role:'user',userId:'x',group,sourceCaseIds:['c1','c2'],memberCaseIds:['c9']}),false);
  assert.equal(canReadGroupDocument({role:'editor',userId:'x',group,sourceCaseIds:['c1'],memberCaseIds:[]}),false);
  assert.equal(canReadGroupDocument({role:'user',userId:'x',group,sourceCaseIds:[],memberCaseIds:[]}),false);
});
