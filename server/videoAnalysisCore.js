import { createWriteStream } from "fs";
import { mkdtemp, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";
import { spawn } from "child_process";
import axios from "axios";
import ffmpegPath from "ffmpeg-static";

const DEFAULT_ANALYSIS_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const DEFAULT_FRAME_COUNT = 6;

function getRequiredGeminiEnv() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing required environment variable: GEMINI_API_KEY");
  }

  return {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || DEFAULT_ANALYSIS_MODEL,
  };
}

async function downloadVideo(fileUrl, targetPath) {
  const response = await axios.get(fileUrl, {
    responseType: "stream",
    timeout: 10 * 60 * 1000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  await pipeline(response.data, createWriteStream(targetPath));

  const contentLength = Number(response.headers["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > 0) {
    return contentLength;
  }

  const fileStats = await stat(targetPath);
  return fileStats.size;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      windowsHide: true,
    });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}

async function extractFrames(videoPath, frameDir, frameCount = DEFAULT_FRAME_COUNT) {
  const framePattern = join(frameDir, "frame-%02d.jpg");
  await runFfmpeg([
    "-y",
    "-i",
    videoPath,
    "-vf",
    `fps=1/10,scale=1024:-1`,
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

  return `${promptText}\n\nAdditional context:\n- You are receiving sampled video frames and an extracted audio track from the same source video.\n- Use the audio track to judge narration, speaking clarity, pacing, and audible quality.\n- Use the frames to judge camera work, sequencing, and graphics.\n- If a category cannot be judged confidently, say so explicitly rather than guessing.`;
}

function parseModelJson(outputText) {
  if (!outputText) {
    return null;
  }

  const cleaned = outputText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
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

async function analyzeAggregateWithGemini({ caseKey, caseTitle, analyses, prompt }) {
  const env = getRequiredGeminiEnv();
  const averageRubric = computeAverageRubric(analyses);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.model)}:generateContent?key=${encodeURIComponent(env.apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildAggregatePrompt({
                caseKey,
                caseTitle,
                analyses,
                averageRubric,
                prompt,
              }),
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini aggregate request failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const outputText = payload?.candidates?.[0]?.content?.parts
    ?.filter((part) => typeof part?.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();

  if (!outputText) {
    throw new Error("Gemini aggregate response was empty.");
  }

  return {
    model: env.model,
    averageRubric,
    outputText,
    parsed: parseModelJson(outputText),
  };
}

async function analyzeMediaWithGemini({ fileName, fileUrl, frames, audio, prompt }) {
  const env = getRequiredGeminiEnv();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.model)}:generateContent?key=${encodeURIComponent(env.apiKey)}`;
  const contents = [
    {
      role: "user",
      parts: [
        { text: buildAnalysisPrompt({ fileName, fileUrl, prompt }) },
        ...(audio
          ? [
              {
                inlineData: {
                  mimeType: audio.mimeType,
                  data: audio.base64,
                },
              },
            ]
          : []),
        ...frames.map((frame) => ({
          inlineData: {
            mimeType: "image/jpeg",
            data: frame.base64,
          },
        })),
      ],
    },
  ];

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API request failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const outputText = payload?.candidates?.[0]?.content?.parts
    ?.filter((part) => typeof part?.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();

  if (!outputText) {
    throw new Error("Gemini API returned an empty response.");
  }

  return {
    model: env.model,
    outputText,
    parsed: parseModelJson(outputText),
  };
}

export async function analyzeVideoFromUrl({ fileName, fileUrl, prompt }) {
  if (!fileUrl) {
    throw new Error("fileUrl is required.");
  }

  const workspace = await mkdtemp(join(tmpdir(), "via-video-analysis-"));
  const videoPath = join(workspace, "source-video");
  const audioPath = join(workspace, "audio.mp3");

  try {
    const downloadedBytes = await downloadVideo(fileUrl, videoPath);
    const frames = await extractFrames(videoPath, workspace);
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
        message: audioError instanceof Error ? audioError.message : String(audioError),
      });
    }

    const analysis = await analyzeMediaWithGemini({
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
      frameCount: frames.length,
      audioBytes: audio?.byteLength || 0,
      model: analysis.model,
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

  const aggregate = await analyzeAggregateWithGemini({
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
    analysis: aggregate.parsed || aggregate.outputText,
    rawText: aggregate.parsed ? undefined : aggregate.outputText,
  };
}
