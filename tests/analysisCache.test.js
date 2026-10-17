import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cachedAnalysis } from '../server/analysisCache.js';

async function setup(t) {
  const saved=process.env.AI_ANALYSIS_CACHE_DIR;
  const directory=await mkdtemp(join(tmpdir(),'via-cache-policy-'));
  process.env.AI_ANALYSIS_CACHE_DIR=directory;
  t.after(async()=>{if(saved===undefined) delete process.env.AI_ANALYSIS_CACHE_DIR; else process.env.AI_ANALYSIS_CACHE_DIR=saved;await rm(directory,{recursive:true,force:true});});
  return directory;
}

test('completed results persist without raw request identities and invalidate on prompt/model changes',async t=>{
  const directory=await setup(t);
  let calls=0;
  const compute=async()=>({summary:'Stored output',sequence:++calls});
  const identity={model:'one',prompt:'private prompt',signedUrl:'private URL'};
  await cachedAnalysis(identity,compute);
  assert.equal((await cachedAnalysis(identity,compute)).cacheHit,true);
  await cachedAnalysis({...identity,model:'two'},compute);
  assert.equal(calls,2);
  const files=await readdir(directory);
  assert.equal(files.length,2);
  assert.doesNotMatch(await readFile(join(directory,files[0]),'utf8'),/private prompt|private URL/);
});

test('unknown provider outcome holds a lock and prevents automatic replay',async t=>{
  await setup(t);
  let calls=0;
  const run=()=>cachedAnalysis({id:'unknown'},async()=>{calls++;const error=new Error('unknown');error.deliveryUnknown=true;throw error;});
  await assert.rejects(run(),/unknown/);
  await assert.rejects(run(),error=>error.status===409 && error.code==='analysis_pending');
  assert.equal(calls,1);
});

test('known rejected provider requests can retry without storing a failed result',async t=>{
  await setup(t);
  await assert.rejects(cachedAnalysis({id:'known'},async()=>{throw new Error('HTTP 429');}),/429/);
  const result=await cachedAnalysis({id:'known'},async()=>({summary:'Recovered'}));
  assert.equal(result.cacheHit,false);
  assert.equal(result.value.summary,'Recovered');
});
