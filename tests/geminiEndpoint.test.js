import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import { unavailableEvaluation } from './helpers/videoEvaluationFixture.js';

test('Cloud Run endpoint keeps its envelope with real generated media and safe Gemini failures', async t => {
  const saved = {...process.env};
  const directory = await mkdtemp(join(tmpdir(), 'via-endpoint-gemini-'));
  Object.assign(process.env, { VIDEO_ANALYSIS_PROVIDER:'gemini', GEMINI_API_KEY:'test-not-real', GEMINI_MODEL:'gemini-3.8-flash',
    VIDEO_ALLOW_LOCAL_TEST_URLS:'true', ANALYSIS_API_TOKEN:'test-service-token', AI_ANALYSIS_CACHE_DIR:directory });
  t.after(async () => { process.env=saved; await rm(directory,{recursive:true,force:true}); });
  const run = promisify(execFile);
  for (const audio of [false,true]) {
    const args = ['-y','-f','lavfi','-i','color=c=blue:s=320x240:r=10:d=3'];
    if(audio) args.push('-f','lavfi','-i','sine=frequency=440:duration=3','-c:a','aac','-shortest');
    args.push('-c:v','libx264','-pix_fmt','yuv420p',join(directory,audio?'sound.mp4':'silent.mp4'));
    await run(ffmpeg,args,{timeout:15000});
  }
  const media = { '/sound.mp4':await readFile(join(directory,'sound.mp4')), '/silent.mp4':await readFile(join(directory,'silent.mp4')) };
  const storage = createServer((req,res)=>{ const bytes=media[req.url]; res.writeHead(bytes?200:404); res.end(bytes); });
  await new Promise(resolve=>storage.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>storage.close(resolve)));
  const { app } = await import('../server/cloud-run-upload.js');
  const backend = createServer(app);
  await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>backend.close(resolve)));
  const originalFetch = globalThis.fetch;
  let upstreamStatus=200, calls=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(!String(url).startsWith('https://generativelanguage.googleapis.com/')) return originalFetch(url,options);
    calls++;
    if(upstreamStatus!==200) return new Response('private provider content',{status:upstreamStatus});
    const body=JSON.parse(options.body);
    const parts=body.contents[0].parts;
    assert.equal(parts.filter(p=>p.inlineData?.mimeType==='image/jpeg').length,6);
    const audio=parts.find(p=>p.inlineData?.mimeType==='audio/mpeg');
    if(audio) assert.ok(Buffer.from(audio.inlineData.data,'base64').length>100);
    const value=unavailableEvaluation();
    value.evaluation.graphics={rating:5,comment:'Readable test frame.'};
    if(audio) value.evaluation.audio={rating:3,comment:'Test tone, no speech.'};
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}],usageMetadata:{totalTokenCount:10}});
  });
  const url=`http://127.0.0.1:${backend.address().port}/api/analyze-video`;
  const send=(file,authorized=true,prompt='Evaluate test media')=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer test-service-token'}:{})},
    body:JSON.stringify({fileName:file,fileUrl:`http://127.0.0.1:${storage.address().port}/${file}`,prompt})});
  assert.equal((await send('sound.mp4',false)).status,401);
  assert.equal(calls,0);
  for(const file of ['sound.mp4','silent.mp4']) {
    const response=await send(file);
    assert.equal(response.status,200);
    const payload=await response.json();
    assert.equal(payload.status,'analyzed');
    assert.equal(payload.fileName,file);
    assert.equal(payload.frameCount,6);
    assert.equal(payload.provider,'gemini');
    assert.equal(payload.model,'gemini-3.8-flash');
    assert.equal(payload.analysis.evaluation.graphics.rating,5);
    assert.equal(payload.analysis.evaluation.audio.rating,file==='sound.mp4'?3:null);
    assert.equal(payload.analysis.evaluation.script_narration.rating,null);
    assert.equal(payload.audioBytes>0,file==='sound.mp4');
    assert.ok(payload.durationSeconds>0);
    assert.ok(payload.downloadedBytes>0);
    assert.equal(payload.usage.vision.totalTokenCount,10);
  }
  upstreamStatus=402;
  const failure=await send('sound.mp4',true,'Different request; billing test');
  assert.equal(failure.status,503);
  const error=await failure.json();
  assert.equal(error.code,'ai_billing_required');
  assert.match(error.error,/402/);
  assert.doesNotMatch(JSON.stringify(error),/private provider content|test-not-real/);
  assert.equal(calls,3);
});
