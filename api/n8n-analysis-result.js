import { createClient } from "@supabase/supabase-js";

function jsonResponse(status, body) {
  return Response.json(body, { status });
}

function getConfiguredValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseAnalysis(value) {
  if (value === undefined || value === null) {
    return { output: undefined, rawText: undefined };
  }

  if (typeof value === "string") {
    try {
      return { output: JSON.parse(value), rawText: undefined };
    } catch {
      return { output: undefined, rawText: value };
    }
  }

  return { output: value, rawText: undefined };
}

export async function POST(request) {
  const callbackSecret = getConfiguredValue(process.env.N8N_CALLBACK_SECRET);
  const providedSecret = request.headers.get("x-n8n-callback-secret");

  if (!callbackSecret || providedSecret !== callbackSecret) {
    return jsonResponse(401, { error: "Unauthorized callback." });
  }

  const supabaseUrl = getConfiguredValue(process.env.SUPABASE_URL) || getConfiguredValue(process.env.VITE_SUPABASE_URL);
  const serviceRoleKey = getConfiguredValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Supabase callback credentials are not configured." });
  }

  try {
    const payload = await request.json();
    const evaluationId = Number(payload?.evaluation_id);
    if (!Number.isInteger(evaluationId) || evaluationId <= 0) {
      return jsonResponse(400, { error: "evaluation_id must be a positive integer." });
    }

    const parsedAnalysis = parseAnalysis(
      payload.analysis_ai_output ?? payload.analysis ?? payload.output,
    );
    const rawText = payload.analysis_ai_raw_text ?? payload.raw_text ?? payload.rawText ?? parsedAnalysis.rawText;
    const update = {};

    if (typeof (payload.analysis_ai_model ?? payload.model) === "string") {
      update.analysis_ai_model = payload.analysis_ai_model ?? payload.model;
    }
    if (parsedAnalysis.output !== undefined) {
      update.analysis_ai_output = parsedAnalysis.output;
    }
    if (typeof rawText === "string") {
      update.analysis_ai_raw_text = rawText;
    }

    if (Object.keys(update).length === 0) {
      return jsonResponse(400, { error: "Provide model, analysis, output, or raw_text." });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase
      .from("evaluations")
      .update(update)
      .eq("id", evaluationId)
      .select("id, video_case_id, analysis_ai_model");

    if (error) {
      return jsonResponse(500, { error: error.message });
    }

    if (!data || data.length === 0) {
      return jsonResponse(404, { error: `Evaluation ${evaluationId} was not found.` });
    }

    return jsonResponse(200, { message: "AI analysis saved.", evaluation: data[0] });
  } catch (error) {
    return jsonResponse(400, {
      error: error instanceof Error ? error.message : "Invalid callback request.",
    });
  }
}

export function GET() {
  return jsonResponse(405, { error: "Method not allowed." });
}
