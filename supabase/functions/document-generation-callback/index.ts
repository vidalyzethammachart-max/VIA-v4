import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DOCUMENT_CALLBACK_SECRET = Deno.env.get("DOCUMENT_CALLBACK_SECRET")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-callback-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type CallbackPayload = {
  evaluation_id?: number | string;
  docId?: string;
  doc_id?: string;
  googleDocId?: string;
  google_doc_id?: string;
  source_doc_id?: string;
  pdf_path?: string;
  pdf_storage_path?: string;
  docx_path?: string;
  docx_storage_path?: string;
  error?: string | null;
  status?: "ready" | "failed" | null;
};

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function extractDocId(payload: CallbackPayload): string | null {
  return normalizeOptionalString(
    payload.docId ??
      payload.doc_id ??
      payload.googleDocId ??
      payload.google_doc_id,
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }

  const providedSecret =
    req.headers.get("x-callback-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  if (!providedSecret || providedSecret !== DOCUMENT_CALLBACK_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized callback" }), {
      status: 401,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }

  try {
    const payload = (await req.json()) as CallbackPayload;
    const evaluationId = Number(payload.evaluation_id);

    if (!evaluationId || !Number.isInteger(evaluationId)) {
      return new Response(JSON.stringify({ ok: false, error: "evaluation_id is required" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const docId = extractDocId(payload);
    const pdfPath = normalizeOptionalString(payload.pdf_storage_path ?? payload.pdf_path);
    const docxPath = normalizeOptionalString(payload.docx_storage_path ?? payload.docx_path);
    const sourceDocId = normalizeOptionalString(payload.source_doc_id);
    const isFailed = payload.status === "failed" || (!docId && Boolean(payload.error));

    const updateValues = isFailed
      ? {
          document_status: "failed",
          document_error: payload.error?.trim() || "Document generation failed.",
          source_doc_id: null,
          pdf_storage_path: null,
          docx_storage_path: null,
        }
      : {
          document_status: "ready",
          document_error: null,
          source_doc_id: sourceDocId ?? docId,
          pdf_storage_path: pdfPath,
          docx_storage_path: docxPath,
        };

    if (!isFailed && !docId && !pdfPath && !docxPath) {
      return new Response(JSON.stringify({ ok: false, error: "At least one document artifact is required for ready status" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const { error } = await adminSupabase
      .from("evaluations")
      .update(updateValues)
      .eq("id", evaluationId);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        evaluationId,
        status: updateValues.document_status,
        docId: docId ?? null,
        sourceDocId,
        pdfPath,
        docxPath,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});
