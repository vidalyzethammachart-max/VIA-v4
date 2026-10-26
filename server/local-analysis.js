import './loadEnv.js';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app } from './cloud-run-upload.js';
import { getGeminiConfig } from './geminiAnalysis.js';

// The tunnel must target this restricted loopback listener, never the upload API.
export async function startLocalAnalysisServer({ port = Number(process.env.LOCAL_ANALYSIS_PORT || 8081) } = {}) {
  if (process.env.VIDEO_ANALYSIS_PROVIDER?.trim() !== 'gemini') {
    throw new Error('Local analysis requires VIDEO_ANALYSIS_PROVIDER=gemini.');
  }
  if (!process.env.ANALYSIS_API_TOKEN?.trim()) throw new Error('Missing ANALYSIS_API_TOKEN.');
  if (process.env.VIDEO_ALLOW_LOCAL_TEST_URLS === 'true') {
    throw new Error('VIDEO_ALLOW_LOCAL_TEST_URLS must be false for the tunnel listener.');
  }
  const config = getGeminiConfig();
  if (config.model !== 'gemini-2.5-flash') throw new Error('Local analysis requires GEMINI_MODEL=gemini-2.5-flash.');
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url?.split('?')[0] !== '/api/analyze-video') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    app(req, res);
  });
  server.requestTimeout = 600000;
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); accept(); });
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startLocalAnalysisServer().then(server => {
    console.log(`[local-analysis] Gemini gemini-2.5-flash on 127.0.0.1:${server.address().port}; POST /api/analyze-video only`);
  }).catch(error => {
    console.error('[local-analysis] Could not start:', error.code === 'EADDRINUSE' ? 'Port is already in use.'
      : /^(Local analysis requires |Missing |VIDEO_ALLOW_LOCAL_TEST_URLS)/.test(error.message) ? error.message : 'Check local configuration.');
    process.exitCode = 1;
  });
}
