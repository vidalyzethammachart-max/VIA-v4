import './loadEnv.js';
import express from 'express';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { requireAnalysisAccess } from './analysisControls.js';
import { analyzeVideoFromUrl } from './videoAnalysisCore.js';
import { getGeminiConfig } from './geminiAnalysis.js';

function validateConfiguration() {
  if (process.env.VIDEO_ANALYSIS_PROVIDER?.trim() !== 'gemini') throw new Error('Hosted analysis requires provider gemini.');
  if (!process.env.ANALYSIS_API_TOKEN?.trim()) throw new Error('Missing ANALYSIS_API_TOKEN.');
  if (process.env.VIDEO_ALLOW_LOCAL_TEST_URLS !== 'false') throw new Error('VIDEO_ALLOW_LOCAL_TEST_URLS must be false.');
  if (getGeminiConfig().model !== 'gemini-2.5-flash') throw new Error('Hosted analysis requires gemini-2.5-flash.');
  if (!process.env.VIDEO_ALLOWED_HOSTS?.trim() && !process.env.R2_ACCOUNT_ID?.trim()) throw new Error('Missing allowed video hosts.');
}

const safeCodes = new Set(['invalid_video', 'analysis_pending', 'ai_auth_failed', 'ai_billing_required',
  'ai_quota_exceeded', 'ai_timeout', 'ai_delivery_unknown', 'invalid_ai_response', 'ai_request_rejected']);

export function createHostedAnalysisApp({ analyze = analyzeVideoFromUrl } = {}) {
  validateConfiguration();
  const app = express();
  app.disable('x-powered-by');
  app.set('strict routing', true);
  app.set('case sensitive routing', true);
  let active = false;
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.post('/api/analyze-video', requireAnalysisAccess, express.json({ limit: '1mb' }), async (req, res) => {
    if (active) return res.status(503).json({ code: 'analysis_busy', error: 'Another video is being analyzed. No job was queued; inspect execution before resubmitting.' });
    active = true;
    try {
      const { fileName, fileUrl, prompt } = req.body || {};
      const result = await analyze({ fileName, fileUrl, prompt });
      res.json(result);
    } catch (error) {
      const known = safeCodes.has(error?.code);
      res.status(known && Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 502)
        .json({ code: known ? error.code : 'analysis_failed',
          error: known ? error.message : 'Video analysis failed. Inspect server status before retrying.' });
    } finally {
      // Keep capacity reserved until computation ends, even if the caller disconnects.
      active = false;
    }
  });
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, _req, res, _next) => {
    res.status(error.type === 'entity.too.large' ? 413 : 400).json({ code: 'invalid_request', error: 'Invalid JSON request body.' });
  });
  return app;
}

export async function startHostedAnalysisServer({ port = Number(process.env.PORT || 10000), host = '0.0.0.0' } = {}) {
  const server = createServer(createHostedAnalysisApp());
  server.requestTimeout = 600000;
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); accept(); });
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startHostedAnalysisServer().then(server => {
    console.log(`[hosted-analysis] Gemini gemini-2.5-flash listening on ${server.address().port}`);
    process.on('SIGTERM', () => server.close(() => process.exit(0)));
  }).catch(() => {
    console.error('[hosted-analysis] Startup failed. Check provider, model, secrets, allowed hosts and port.');
    process.exitCode = 1;
  });
}
