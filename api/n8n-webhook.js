const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "https://vidalyze.app.n8n.cloud/webhook/google-form-hook";

const REQUIRED_RUBRIC_KEYS = [
  "language_and_script",
  "camera_angle",
  "composition",
  "narrator",
  "story_sequence",
  "scene_and_location",
  "lighting",
  "audio",
  "graphics_and_visuals",
];

function jsonResponse(status, body) {
  return Response.json(body, { status });
}

function validateRubric(payload) {
  const items = Array.isArray(payload) ? payload : [payload];

  for (const [index, item] of items.entries()) {
    if (!item || !Array.isArray(item.rubric)) {
      return `Item ${index + 1}: rubric must be an array.`;
    }

    const rubricByKey = new Map(item.rubric.map((rubric) => [rubric?.key, rubric]));
    const missingSections = REQUIRED_RUBRIC_KEYS.filter((key) => !rubricByKey.has(key));
    if (missingSections.length > 0) {
      return `Item ${index + 1}: missing rubric sections: ${missingSections.join(", ")}.`;
    }

    for (const key of REQUIRED_RUBRIC_KEYS) {
      const scores = rubricByKey.get(key)?.scores;
      const isValid =
        Array.isArray(scores) &&
        scores.length === 5 &&
        scores.every((score) => Number.isInteger(score) && score >= 1 && score <= 5);

      if (!isValid) {
        return `Item ${index + 1}: ${key} must contain exactly 5 integer scores between 1 and 5.`;
      }
    }
  }

  return null;
}

async function forwardJson(body) {
  return fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function POST(request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      return jsonResponse(415, {
        error: "Video files must be uploaded directly to R2 before calling this webhook proxy.",
      });
    }

    const payload = await request.json();
    const rubricError = validateRubric(payload);
    if (rubricError) {
      return jsonResponse(400, { error: rubricError });
    }

    const response = await forwardJson(payload);

    const responseText = await response.text();
    return new Response(responseText, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    console.error("[n8n-webhook] forward failed", error);
    return jsonResponse(502, {
      error: error instanceof Error ? error.message : "Failed to forward webhook request.",
    });
  }
}

export function GET() {
  return jsonResponse(405, { error: "Method not allowed." });
}
