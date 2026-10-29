import { createWriteStream } from "fs";
import { mkdtemp, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";
import { spawn } from "child_process";
import { Transform } from 'node:stream';
import axios from "axios";
import ffmpegPath from "ffmpeg-static";

import { generateOpenAiAnalysis } from "./openAiAnalysis.js";
import { generateVideoAnalysis, getVideoAnalysisConfig } from "./videoAnalysisProvider.js";
import { validateVideoSource, parseMediaDuration, validationError } from './analysisControls.js';

const DEFAULT_FRAME_COUNT = 6;

async function downloadVideo(fileUrl, targetPath) {
  validateVideoSource(fileUrl);
  const response = await axios.get(fileUrl, {
    responseType: "stream",
    timeout: 10 * 60 * 1000,
    signal: AbortSignal.timeout(10 * 60 * 1000),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    maxRedirects: 0,
    proxy: false,
  });
  let received = 0;
  const bound = new Transform({ transform(chunk,_encoding,callback) {
    received += chunk.length;
    callback(received > 1024*1024*1024 ? validationError('Video file must be 1GB or smaller.') : null,chunk);
  }});
  await pipeline(response.data, bound, createWriteStream(targetPath));

  const fileStats = await stat(targetPath);
  return fileStats.size;
}

function runFfmpeg(args, {probe=false}={}) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      windowsHide: true,
    });
    let stderr = "";
    // Allow slow CPU hosts up to ten minutes for each media-processing step.
    const timer = setTimeout(() => { child.kill(); }, 600000);

    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-16000);
    });

    child.on("error", () => {clearTimeout(timer);reject(validationError('Unable to start media processing.'));});
    child.on("close", (code) => {
      clearTimeout(timer);
      if(probe) { resolve(stderr); return; }
      if (code === 0) {
        resolve();
        return;
      }

      reject(validationError('Media processing failed or exceeded the time limit.'));
    });
  });
}

async function extractFrames(videoPath, frameDir, duration, frameCount = DEFAULT_FRAME_COUNT) {
  const framePattern = join(frameDir, "frame-%02d.jpg");
  await runFfmpeg([
    "-y",
    "-i",
    videoPath,
    "-vf",
    `fps=${frameCount / duration},scale=1024:-1`,
    "-frames:v",
    String(frameCount),
    "-q:v",
    "3",
    framePattern,
  ]);

  const frames = [];
  for (let i = 1; i <= frameCount; i += 1) {
    const path = join(frameDir, `frame-${String(i).padStart(2, "0")}.jpg`);
    try {
      const buffer = await readFile(path);
      const base64 = buffer.toString("base64");
      frames.push({
        path,
        dataUrl: `data:image/jpeg;base64,${base64}`,
        base64,
      });
    } catch {
      break;
    }
  }

  if (frames.length === 0) {
    throw new Error("No frames could be extracted from the video.");
  }

  return frames;
}

async function extractAudioTrack(videoPath, audioPath) {
  await runFfmpeg([
    "-y",
    "-i",
    videoPath,
    "-vn",
    "-map",
    "0:a:0?",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "48k",
    "-acodec",
    "libmp3lame",
    audioPath,
  ]);
}

function buildAnalysisPrompt({ fileName, fileUrl, prompt }) {
  const promptText =
    prompt ||
    `You are an educational video evaluation assistant.

Analyze the sampled frames and extracted audio from this uploaded video and produce a concise structured evaluation.

Video metadata:
- File name: ${fileName || "unknown"}
- File URL: ${fileUrl}

Focus on:
1. Main topic and likely purpose
2. Visual clarity and readability
3. Educational value
4. Content organization
5. Viewer engagement
6. Spoken narration and audio quality
7. Visible technical quality issues
8. Concrete improvement suggestions

Return JSON only:
{
  "summary": "Brief summary of what is visible and heard",
  "topic": "Main topic",
  "purpose": "Likely purpose",
  "quality_scores": {
    "visual_quality": 1,
    "educational_value": 1,
    "organization": 1,
    "engagement": 1,
    "technical_quality": 1,
    "audio_quality": 1,
    "narration_quality": 1
  },
  "strengths": [],
  "issues": [],
  "recommendations": [],
  "overall_score": 1,
  "limitations": []
}

Scoring: 1 = poor, 5 = excellent.
Base your answer only on the provided frames and extracted audio. If inputs are insufficient, say what is missing.`;

  return `${promptText}\n\nAdditional context:\n- You receive sampled video frames and, when available, a separate assessment of actual audio.\n- Use audio evidence to judge narration, speaking clarity, pacing, and audible quality.\n- Use the sampled frames to judge camera work and graphics; do not claim a complete frame-by-frame review.\n- If audio is unavailable, audio_quality and narration_quality must be null with an explicit limitation. Never infer sound quality from images or a transcript alone.\n- Human rubric scores are separate evidence and must never be overwritten or averaged with AI scores.\n- If a category cannot be judged confidently, say so explicitly rather than guessing.`;
}

function toFiniteNumber(value) {
  const parsed = typeof value === "string" ? Number(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeAverageRubric(analyses) {
  const totals = new Map();
  const counts = new Map();

  for (const analysis of analyses) {
    const rubric = analysis?.rubric && typeof analysis.rubric === "object" ? analysis.rubric : {};
    for (const [sectionId, questions] of Object.entries(rubric)) {
      if (!questions || typeof questions !== "object") continue;
      if (!totals.has(sectionId)) {
        totals.set(sectionId, new Map());
        counts.set(sectionId, new Map());
      }

      const sectionTotals = totals.get(sectionId);
      const sectionCounts = counts.get(sectionId);

      for (const [questionId, rawValue] of Object.entries(questions)) {
        const score = toFiniteNumber(rawValue);
        if (score === null) continue;

        sectionTotals.set(questionId, (sectionTotals.get(questionId) || 0) + score);
        sectionCounts.set(questionId, (sectionCounts.get(questionId) || 0) + 1);
      }
    }
  }

  const result = {};
  for (const [sectionId, questionTotals] of totals.entries()) {
    result[sectionId] = {};
    const sectionCounts = counts.get(sectionId) || new Map();
    for (const [questionId, total] of questionTotals.entries()) {
      const count = sectionCounts.get(questionId) || 0;
      result[sectionId][questionId] = count > 0 ? Number((total / count).toFixed(2)) : null;
    }
  }

  return result;
}

function stringifyAnalysisSnapshot(analysis, index) {
  const sourceLabel = analysis?.requested_by || analysis?.user_id || `review-${index + 1}`;
  const createdAt = analysis?.created_at || analysis?.submitted_at || null;
  const overallSuggestion =
    typeof analysis?.overall_suggestion === "string" ? analysis.overall_suggestion.trim() : "";
  const aiSummary = analysis?.analysis_ai_output || analysis?.ai_output || null;
  const rubric = analysis?.rubric || {};

  return {
    source: sourceLabel,
    createdAt,
    overallSuggestion: overallSuggestion || null,
    aiSummary,
    rubric,
  };
}

function buildAggregatePrompt({ caseKey, caseTitle, analyses, averageRubric, prompt }) {
  const analysisSnapshots = analyses.map((analysis, index) => stringifyAnalysisSnapshot(analysis, index));
  const promptText =
    prompt ||
    `You are an educational video evaluation assistant.

Combine the individual analyses for the same video case into one unified final evaluation.

Case metadata:
- Case key: ${caseKey}
- Case title: ${caseTitle || caseKey}
- Number of individual analyses: ${analyses.length}

Use the following data:
1. Individual rubric scores and suggestions from each reviewer.
2. The averaged rubric scores across all reviewers.
3. Any AI summaries already produced for each reviewer.

Return JSON only:
{
  "summary": "Short overall summary",
  "consensus": "What all reviewers agree on",
  "differences": ["Where reviewers differed"],
  "strengths": ["Shared strengths"],
  "issues": ["Shared issues"],
  "recommendations": ["Final combined recommendations"],
  "limitations": ["What cannot be concluded confidently"],
  "final_score_averages": {},
  "confidence": 1
}

Score confidence should be a number from 1 to 5, where 5 means the reviewers are highly aligned.
Base the response on the supplied analyses and averages only.`;

  return `${promptText}\n\nAveraged rubric:\n${JSON.stringify(averageRubric, null, 2)}\n\nIndividual analyses:\n${JSON.stringify(analysisSnapshots, null, 2)}`;
}

async function analyzeAggregateWithOpenAi({ caseKey, caseTitle, analyses, prompt }) {
  const averageRubric = computeAverageRubric(analyses);
  const result = await generateOpenAiAnalysis({ prompt: buildAggregatePrompt({ caseKey, caseTitle, analyses, averageRubric, prompt }) });
  return { ...result, averageRubric };
}

async function analyzeMedia({ fileName, frames, audio, prompt }) {
  return generateVideoAnalysis({
    prompt: buildAnalysisPrompt({ fileName, fileUrl: "[stored video; sampled evidence supplied]", prompt }), frames, audio,
  });
}

export async function analyzeVideoFromUrl({ fileName, fileUrl, prompt }) {
  if (!fileUrl) {
    throw new Error("fileUrl is required.");
  }

  getVideoAnalysisConfig(); // Fail before downloading media if credentials are missing.
  const workspace = await mkdtemp(join(tmpdir(), "via-video-analysis-"));
  const videoPath = join(workspace, "source-video");
  const audioPath = join(workspace, "audio.mp3");

  try {
    const downloadedBytes = await downloadVideo(fileUrl, videoPath);
    const metadata = await runFfmpeg(['-hide_banner','-i',videoPath], {probe:true});
    const durationSeconds = parseMediaDuration(metadata);
    const configuredFrames = Number(process.env.VIDEO_ANALYSIS_FRAME_COUNT || DEFAULT_FRAME_COUNT);
    const frameCount = Number.isInteger(configuredFrames) ? Math.min(12,Math.max(3,configuredFrames)) : DEFAULT_FRAME_COUNT;
    const frames = await extractFrames(videoPath, workspace, durationSeconds, frameCount);
    let audio = null;

    try {
      await extractAudioTrack(videoPath, audioPath);
      const audioStats = await stat(audioPath);

      if (audioStats.size > 0) {
        const audioBuffer = await readFile(audioPath);
        audio = {
          mimeType: "audio/mpeg",
          base64: audioBuffer.toString("base64"),
          byteLength: audioBuffer.length,
        };
      }
    } catch (audioError) {
      console.warn("[video-analysis] audio extraction failed, continuing without audio", {
        message: 'Audio evidence unavailable; do not score audio from images.',
      });
    }

    const analysis = await analyzeMedia({
      fileName,
      fileUrl,
      frames,
      audio,
      prompt,
    });

    return {
      status: "analyzed",
      fileName,
      fileUrl,
      downloadedBytes,
      durationSeconds,
      frameCount: frames.length,
      audioBytes: audio?.byteLength || 0,
      model: analysis.model,
      audioModel: analysis.audioModel,
      provider: analysis.provider,
      promptVersion: analysis.promptVersion,
      usage: analysis.usage,
      cache: analysis.cache,
      estimatedCostUsd: analysis.estimatedCostUsd,
      analysis: analysis.parsed || analysis.outputText,
      rawText: analysis.parsed ? undefined : analysis.outputText,
    };
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
}

export async function analyzeVideoCaseAggregate({ caseKey, caseTitle, analyses, prompt }) {
  if (!caseKey) {
    throw new Error("caseKey is required.");
  }

  if (!Array.isArray(analyses) || analyses.length === 0) {
    throw new Error("At least one analysis is required.");
  }

  const aggregate = await analyzeAggregateWithOpenAi({
    caseKey,
    caseTitle,
    analyses,
    prompt,
  });

  return {
    caseKey,
    caseTitle: caseTitle || caseKey,
    sourceCount: analyses.length,
    averageRubric: aggregate.averageRubric,
    model: aggregate.model,
    provider: aggregate.provider,
    promptVersion: aggregate.promptVersion,
    usage: aggregate.usage,
    cache: aggregate.cache,
    estimatedCostUsd: aggregate.estimatedCostUsd,
    analysis: aggregate.parsed || aggregate.outputText,
    rawText: aggregate.parsed ? undefined : aggregate.outputText,
  };
}
