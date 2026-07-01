import {
  isAllowedVideo,
  MAX_FILE_SIZE_BYTES,
  processVideoUpload,
} from "../server/videoUploadCore.js";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://via3-app.vercel.app",
];

function getCorsHeaders(request) {
  const requestOrigin = request?.headers?.get("origin") || "";
  const allowedOrigins = [
    ...DEFAULT_ALLOWED_ORIGINS,
    ...(process.env.CORS_ORIGIN || "")
      .split(",")
      .map((value) => value.trim()),
  ]
    .filter(Boolean);

  const allowOrigin = allowedOrigins.includes("*")
    ? "*"
    : allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : allowedOrigins[0] || DEFAULT_ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function jsonResponse(status, body, request) {
  return Response.json(body, {
    status,
    headers: getCorsHeaders(request),
  });
}

async function parseVideoFile(request) {
  const formData = await request.formData();
  const file = formData.get("video");

  if (!(file instanceof File)) {
    return { error: jsonResponse(400, { error: "No video file was uploaded." }, request) };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { error: jsonResponse(413, { error: "Video file must be 1GB or smaller." }, request) };
  }

  if (!isAllowedVideo(file.name, file.type)) {
    return {
      error: jsonResponse(400, {
        error: "Only .mp4, .mov, .webm, and .m4v video files are allowed.",
      }, request),
    };
  }

  return {
    file: {
      name: file.name,
      mimeType: file.type,
      size: file.size,
    },
    video: file,
    fields: {
      subjectName: String(formData.get("subject_name") || ""),
      orderNumber: String(formData.get("order_number") || ""),
      email: String(formData.get("email") || ""),
      userId: String(formData.get("user_id") || ""),
      evaluationId: String(formData.get("evaluation_id") || ""),
      submissionId: String(formData.get("submission_id") || ""),
      overallSuggestion: String(formData.get("overall_suggestion") || ""),
      rubric: String(formData.get("rubric") || ""),
      payload: String(formData.get("payload") || ""),
    },
  };
}

export async function POST(request) {
  try {
    const parsed = await parseVideoFile(request);

    if (parsed.error) {
      return parsed.error;
    }

    return jsonResponse(200, await processVideoUpload(parsed), request);
  } catch (error) {
    console.error("[upload-video] upload failed", error);
    return jsonResponse(502, {
      error: error.publicMessage || (error instanceof Error ? error.message : "Video upload failed."),
      detail: error.publicMessage && error instanceof Error ? error.message : undefined,
    }, request);
  }
}

export function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export function GET(request) {
  return jsonResponse(405, { error: "Method not allowed." }, request);
}
