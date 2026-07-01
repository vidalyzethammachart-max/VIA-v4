import "./loadEnv.js";
import express from "express";
import fs from "node:fs";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import axios from "axios";
import FormData from "form-data";
import multer from "multer";
import {
  getRequiredEnv,
  isAllowedVideo,
  MAX_FILE_SIZE_BYTES,
  sanitizeFileName,
} from "./videoUploadCore.js";
import { analyzeVideoFromUrl } from "./videoAnalysisCore.js";
import { createR2VideoPresign } from "./r2Presign.js";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://via3-app.vercel.app",
];

const app = express();
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
    fileSize: MAX_FILE_SIZE_BYTES,
  },
});

function getAllowedCorsOrigin(requestOrigin) {
  const allowedOrigins = [
    ...DEFAULT_ALLOWED_ORIGINS,
    ...(process.env.CORS_ORIGIN || "")
      .split(",")
      .map((value) => value.trim()),
  ]
    .filter(Boolean);

  if (allowedOrigins.includes("*")) {
    return "*";
  }

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return allowedOrigins[0] || "*";
}

function setCorsHeaders(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", getAllowedCorsOrigin(req.headers.origin));
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  next();
}

app.use(setCorsHeaders);

app.options("/api/upload-video", (_req, res) => {
  res.status(204).end();
});

app.options("/api/r2-presign-upload", (_req, res) => {
  res.status(204).end();
});

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
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
    console.error("[cloud-run-upload] failed to presign R2 upload", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to create upload URL.",
    });
  }
});

async function relayVideoUpload({ file, fields }) {
  const env = getRequiredEnv();
  const receivedAt = new Date().toISOString();
  const metadata = {
    fileName: file.originalname,
    safeFileName: sanitizeFileName(file.originalname),
    mimeType: file.mimetype,
    fileSize: file.size,
    receivedAt,
    subjectName: fields.subjectName || "",
    orderNumber: fields.orderNumber || "",
    email: fields.email || "",
    userId: fields.userId || "",
    evaluationId: fields.evaluationId || "",
    submissionId: fields.submissionId || "",
    status: "sent",
  };

  const formData = new FormData();
  formData.append("video", fs.createReadStream(file.path), {
    filename: file.originalname,
    contentType: file.mimetype,
    knownLength: file.size,
  });

  if (fields.payload) {
    formData.append("payload", fields.payload);
  } else {
    formData.append("evaluation_id", fields.evaluationId || "");
    formData.append("submission_id", fields.submissionId || "");
    formData.append("subject_name", fields.subjectName || "");
    formData.append("order_number", fields.orderNumber || "");
    formData.append("email", fields.email || "");
    formData.append("user_id", fields.userId || "");
    formData.append("overall_suggestion", fields.overallSuggestion || "");
    formData.append("rubric", fields.rubric || "");
    formData.append("fileName", metadata.fileName);
    formData.append("safeFileName", metadata.safeFileName);
    formData.append("mimeType", metadata.mimeType);
    formData.append("fileSize", String(metadata.fileSize));
    formData.append("receivedAt", metadata.receivedAt);
    formData.append("status", metadata.status);
  }

  await axios.post(env.webhookUrl, formData, {
    headers: formData.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 10 * 60 * 1000,
  });

  return metadata;
}

app.post("/api/analyze-video", express.json({ limit: "1mb" }), async (req, res) => {
  try {
    const { fileName, fileUrl, prompt } = req.body || {};
    const result = await analyzeVideoFromUrl({ fileName, fileUrl, prompt });
    res.status(200).json(result);
  } catch (error) {
    console.error("[cloud-run-upload] analysis failed", error);
    res.status(502).json({
      error: error instanceof Error ? error.message : "Video analysis failed.",
    });
  }
});

app.post("/api/upload-video", upload.single("video"), async (req, res) => {
  const file = req.file;

  try {
    if (!file) {
      res.status(400).json({ error: "No video file was uploaded." });
      return;
    }

    if (!isAllowedVideo(file.originalname, file.mimetype)) {
      res.status(400).json({
        error: "Only .mp4, .mov, .webm, and .m4v video files are allowed.",
      });
      return;
    }

    const metadata = await relayVideoUpload({
      file,
      fields: {
        subjectName: String(req.body?.subject_name || ""),
        orderNumber: String(req.body?.order_number || ""),
        email: String(req.body?.email || ""),
        userId: String(req.body?.user_id || ""),
        evaluationId: String(req.body?.evaluation_id || ""),
        submissionId: String(req.body?.submission_id || ""),
        overallSuggestion: String(req.body?.overall_suggestion || ""),
        rubric: String(req.body?.rubric || ""),
        payload: String(req.body?.payload || ""),
      },
    });

    res.status(200).json(metadata);
  } catch (error) {
    console.error("[cloud-run-upload] upload failed", error);
    const statusCode = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? 413 : 502;
    res.status(statusCode).json({
      error: error.publicMessage || (error instanceof Error ? error.message : "Video upload failed."),
      detail: error.publicMessage && error instanceof Error ? error.message : undefined,
    });
  } finally {
    if (file?.path) {
      void unlink(file.path).catch((cleanupError) => {
        console.error("[cloud-run-upload] failed to remove temp upload", {
          path: file.path,
          message: cleanupError.message,
        });
      });
    }
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`[cloud-run-upload] listening on ${port}`);
});
