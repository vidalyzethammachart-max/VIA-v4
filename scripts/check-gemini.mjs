import '../server/loadEnv.js';
import { getGeminiConfig, generateGeminiAnalysis } from '../server/geminiAnalysis.js';

try {
  const config = getGeminiConfig();
  if (process.argv.includes('--generate')) {
    const result = await generateGeminiAnalysis({ prompt: 'Synthetic connectivity check. No video or audio is supplied. Return all six evaluation categories with null ratings and explain the missing evidence.' });
    const ok = Object.values(result.parsed.evaluation).every(item => item.rating === null);
    console.log(JSON.stringify({ ok, model: result.model, cacheHit: result.cache.visionHit,
      note: 'Text check only. A cache hit does not prove fresh provider availability or remaining quota.' }));
    if (!ok) process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ configValid: true, model: config.model,
      note: 'Local configuration check only; no provider request or quota verification.' }));
  }
} catch (error) {
  const safe = /^(Missing required environment variable: GEMINI_API_KEY|Invalid GEMINI_MODEL configuration\.|Gemini (request|analysis))/.test(error.message);
  console.error(safe ? error.message : 'Gemini check failed; no key, source content or provider response logged.');
  process.exitCode = 1;
}
