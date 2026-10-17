import '../server/loadEnv.js';
import { getOpenAiConfig, generateOpenAiAnalysis } from '../server/openAiAnalysis.js';

try {
  const config = getOpenAiConfig();
  if (process.argv.includes('--generate')) {
    // Synthetic input only: never sends evaluations, signed URLs, or user media.
    const result = await generateOpenAiAnalysis({ prompt: 'Return JSON only: {"ok":true}. This is a synthetic connectivity test.' });
    console.log(JSON.stringify({ ok: result.parsed.ok === true, model: result.model, cacheHit:result.cache?.visionHit,
      note:'A cache hit proves reuse, not fresh provider availability.' }));
  } else {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(config.model)}`, {
      headers: { Authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(15000),
    });
    console.log(JSON.stringify({ credentialCheckStatus: response.status, model: config.model,
      note: 'Model access alone does not prove available inference credit.' }));
    if (!response.ok) process.exitCode = 1;
  }
} catch (error) {
  console.error(/^(Missing required environment variable: OPENAI_API_KEY|OpenAI (request|analysis|audio))/.test(error.message) ? error.message : 'OpenAI connectivity check failed; no credentials or provider body logged.');
  process.exitCode = 1;
}
