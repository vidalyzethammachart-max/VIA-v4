import "./server/loadEnv.js";
import axios from "axios";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import FormData from "form-data";
import multer from "multer";
import { analyzeVideoFromUrl } from "./server/videoAnalysisCore.js";
import { createR2VideoPresign } from "./server/r2Presign.js";

const PORT = Number(process.env.PORT || 8080);
const MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://via3-app.vercel.app",
];

const app = express();

function resolveCorsOrigin(origin, callback) {
  const allowedOrigins = [
    ...DEFAULT_ALLOWED_ORIGINS,
    ...(process.env.CORS_ORIGIN || "")
      .split(",")
      .map((value) => value.trim()),
  ]
    .filter(Boolean);

  if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error(`Origin not allowed by CORS: ${origin}`));
}

// Restrict browser access to the configured frontend origin while still
// supporting Render health checks and non-browser server-to-server requests.
app.use(
  cors({
    origin: resolveCorsOrigin,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname);
      const safeName = `${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`;
      callback(null, safeName);
    },
  }),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
  },
});

app.get("/", (_req, res) => {
  res.status(200).send("Upload API running");
});

app.post("/api/r2-presign-upload", express.json({ limit: "1mb" }), (req, res) => {
  try {
    const presign = createR2VideoPresign({
      fileName: String(req.body?.fileName || ""),
      mimeType: String(req.body?.mimeType || ""),
      fileSize: Number(req.body?.fileSize || 0),
      userId: String(req.body?.userId || ""),
      evaluationId: req.body?.evaluationId ? String(req.body.evaluationId) : "",
    });

    res.status(200).json(presign);
  } catch (error) {
    console.error("[upload-api] failed to presign R2 upload", error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to create upload URL.",
    });
  }
});

app.post("/api/analyze-video", express.json({ limit: "1mb" }), async (req, res) => {
  try {
    const { fileName, fileUrl, prompt } = req.body || {};
    const result = await analyzeVideoFromUrl({ fileName, fileUrl, prompt });

    res.status(200).json(result);
  } catch (error) {
    console.error("[upload-api] analysis failed", error);
    res.status(502).json({
      error: error instanceof Error ? error.message : "Video analysis failed.",
    });
  }
});

app.post("/api/upload-video", upload.single("video"), async (req, res) => {
  const video = req.file;

  try {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    const payload = req.body?.payload;

    if (!webhookUrl) {
      res.status(500).json({
        success: false,
        message: "Missing required environment variable: N8N_WEBHOOK_URL",
      });
      return;
    }

    if (!payload) {
      res.status(400).json({
        success: false,
        message: "Missing required multipart field: payload",
      });
      return;
    }

    if (!video) {
      res.status(400).json({
        success: false,
        message: "Missing required multipart field: video",
      });
      return;
    }

    const formData = new FormData();
    formData.append("payload", payload);
    formData.append("video", fs.createReadStream(video.path), {
      filename: video.originalname,
      contentType: video.mimetype,
      knownLength: video.size,
    });

    // Forward the multipart request server-to-server. Axios body limits are
    // disabled so large video files can pass through this relay to n8n.
    const response = await axios.post(webhookUrl, formData, {
      headers: formData.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: REQUEST_TIMEOUT_MS,
    });

    res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data
      ? typeof error.response.data === "string"
        ? error.response.data
        : JSON.stringify(error.response.data)
      : error.message;

    console.error("[upload-api] failed to relay upload", {
      status,
      message,
    });

    res.status(status).json({
      success: false,
      message,
    });
  } finally {
    if (video?.path) {
      void unlink(video.path).catch((cleanupError) => {
        console.error("[upload-api] failed to remove temp upload", {
          path: video.path,
          message: cleanupError.message,
        });
      });
    }
  }
});

// Return consistent JSON errors for Multer parsing failures, including files
// larger than the configured upload limit.
app.use((error, _req, res, next) => {
  if (!error) {
    next();
    return;
  }

  const status = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
    ? 413
    : 500;

  res.status(status).json({
    success: false,
    message: error.message,
  });
});

const server = app.listen(PORT, () => {
  console.log(`[upload-api] listening on port ${PORT}`);
});

// Keep long-running video uploads open long enough for Render -> n8n transfer.
server.timeout = REQUEST_TIMEOUT_MS;
