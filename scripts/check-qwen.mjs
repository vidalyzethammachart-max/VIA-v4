import '../server/loadEnv.js';
import { getQwenConfig, generateQwenAnalysis } from '../server/qwenAnalysis.js';

try {
  const config = getQwenConfig();
  if (process.argv.includes('--generate')) {
    // Explicit opt-in to a potentially billable synthetic request. No evaluation or video is sent.
    const result = await generateQwenAnalysis({ prompt: 'Synthetic connectivity test. Return JSON only: {"ok":true}.' });
    const ok = result.parsed.ok === true;
    console.log(JSON.stringify({ ok, model: result.model, cacheHit: result.cache.visionHit,
      note: 'A cache hit proves reuse, not fresh provider availability. This text check does not verify media analysis.' }));
    if (!ok) process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ configValid: true, model: config.model,
      note: 'Local configuration only; no provider request made and model access/quota not verified.' }));
  }
} catch (error) {
  // Print only adapter-owned messages, never arbitrary transport or provider bodies.
  const safe = /^(Missing required environment variable: DASHSCOPE_|Invalid Qwen endpoint configuration\.|Unsupported QWEN_MODEL\.|Qwen (request|analysis|audio))/.test(error.message);
  console.error(safe ? error.message : 'Qwen check failed. Credentials, source content and provider response are not logged.');
  process.exitCode = 1;
}
