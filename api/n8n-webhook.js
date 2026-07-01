const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "https://vidalyze.app.n8n.cloud/webhook/google-form-hook";

function jsonResponse(status, body) {
  return Response.json(body, { status });
}

async function forwardJson(request) {
  const body = await request.text();
  return fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
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

    const response = await forwardJson(request);

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
