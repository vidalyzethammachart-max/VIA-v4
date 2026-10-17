// Billable end-to-end backend smoke check using generated media only.
import '../server/loadEnv.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import { analyzeVideoFromUrl } from '../server/videoAnalysisCore.js';

const directory = await mkdtemp(join(tmpdir(), 'via-openai-smoke-'));
process.env.VIDEO_ALLOW_LOCAL_TEST_URLS = 'true';
let server;
try {
  const file = join(directory, 'synthetic.mp4');
  await promisify(execFile)(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=10:d=12',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', file], { windowsHide: true, timeout: 15000 });
  const bytes = await readFile(file);
  server = createServer((_req, res) => { res.writeHead(200, {'Content-Type':'video/mp4','Content-Length':bytes.length}); res.end(bytes); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const result = await analyzeVideoFromUrl({fileName:'synthetic.mp4', fileUrl:`http://127.0.0.1:${server.address().port}/synthetic.mp4`});
  console.log(JSON.stringify({status:result.status, model:result.model, audioModel:result.audioModel,
    frameCount:result.frameCount, audioBytes:result.audioBytes, cache:result.cache,
    structuredAnalysis:typeof result.analysis === 'object'}));
} catch (error) {
  console.error(error.message.startsWith('OpenAI ') ? error.message : 'Synthetic media check failed; source data and credentials not logged.');
  process.exitCode = 1;
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(directory, {recursive:true,force:true});
}
