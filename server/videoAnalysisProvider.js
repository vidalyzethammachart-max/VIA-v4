import { generateOpenAiAnalysis, getOpenAiConfig } from './openAiAnalysis.js';
import { generateQwenAnalysis, getQwenConfig } from './qwenAnalysis.js';
import { generateGeminiAnalysis, getGeminiConfig } from './geminiAnalysis.js';

function provider() {
  const selected = process.env.VIDEO_ANALYSIS_PROVIDER?.trim() || 'openai';
  if (!['openai', 'qwen', 'gemini'].includes(selected)) throw new Error('Unsupported VIDEO_ANALYSIS_PROVIDER. Use openai, qwen or gemini.');
  return selected;
}

export function getVideoAnalysisConfig() {
  const selected = provider();
  if (selected === 'gemini') return getGeminiConfig();
  return selected === 'qwen' ? getQwenConfig() : getOpenAiConfig();
}

export function generateVideoAnalysis(input) {
  const selected = provider();
  if (selected === 'gemini') return generateGeminiAnalysis(input);
  return selected === 'qwen' ? generateQwenAnalysis(input) : generateOpenAiAnalysis(input);
}
