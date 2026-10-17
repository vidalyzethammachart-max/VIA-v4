import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const flow=JSON.parse(readFileSync(new URL('../n8n/workflows/via-openai-video-adapter.json',import.meta.url),'utf8'));
const node=flow.nodes.find(n=>n.type==='n8n-nodes-base.httpRequest');
const preserve=flow.nodes.find(n=>n.type==='n8n-nodes-base.code').parameters.jsCode;

test('importable adapter is inactive, requires Header Auth, and contains no embedded credentials',()=>{
  assert.equal(flow.active,false);
  assert.equal(node.parameters.genericAuthType,'httpHeaderAuth');
  assert.ok(flow.nodes.every(n=>!n.credentials));
  assert.ok(node.parameters.url.endsWith('.example.invalid/api/analyze-video'));
  assert.equal(node.retryOnFail,undefined);
  assert.equal(flow.nodes.some(n=>n.type==='n8n-nodes-base.webhook'),false);
});

test('with-video adapter maps the existing R2 payload and preserves targets without mixing scores',()=>{
  const source={evaluation_id:123,document_type:'evaluation',rubric:{a:{q1:1}},video:{downloadUrl:'https://storage.invalid/video',fileName:'test.mp4'}};
  const body=runInNewContext(`(${node.parameters.jsonBody.slice(3,-2)})`,{$json:source});
  assert.equal(body.fileUrl,source.video.downloadUrl);
  const result=runInNewContext(`(function(){${preserve}})()`,{$json:{status:'analyzed',analysis:{overall_score:5}},$:()=>({item:{json:source}})}).json;
  assert.equal(result.evaluation_id,123);
  assert.equal(result.analysis.overall_score,5);
  assert.equal(source.rubric.a.q1,1);
  assert.equal(Object.hasOwn(result,'rubric'),false);
});

test('summary adapter preserves aggregate_id and rejects ambiguous mixed targets',()=>{
  const run=source=>runInNewContext(`(function(){${preserve}})()`,{$json:{analysis:{summary:'Combined'}},$:()=>({item:{json:source}})}).json;
  const result=run({aggregate_id:'aggregate',document_type:'video_case_summary'});
  assert.equal(result.aggregate_id,'aggregate');
  assert.equal(Object.hasOwn(result,'evaluation_id'),false);
  assert.throws(()=>run({aggregate_id:'aggregate',evaluation_id:1}),/Ambiguous/);
});
