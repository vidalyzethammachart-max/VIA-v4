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
