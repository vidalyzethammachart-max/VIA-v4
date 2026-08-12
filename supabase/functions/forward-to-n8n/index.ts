import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveDocumentTarget } from "../_shared/documentTarget.js";

const WEBHOOK_URL = Deno.env.get("N8N_WEBHOOK_URL")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DOCUMENTS_BUCKET = Deno.env.get("DOCUMENTS_BUCKET") || "evaluation-documents";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type ForwardPayload = {
  evaluation_id?: number;
  aggregate_id?: string;
  document_type?: "evaluation" | "video_case_summary";
  subject_name?: string | null;
  order_number?: string | null;
  Email?: string | null;
  summary?: Record<string, unknown> | null;
};

function extractDocId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const direct =
    record.docId ??
    record.doc_id ??
    record.googleDocId ??
    record.google_doc_id;

  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const nested = record.data;
  if (nested && typeof nested === "object") {
    return extractDocId(nested);
  }

  return null;
}

async function updateDocument(
  target: ReturnType<typeof resolveDocumentTarget>,
  values: {
    source_doc_id?: string | null;
    document_status: "ready" | "failed";
    document_error?: string | null;
  },
) {
  const { error } = await adminSupabase
    .from(target.table)
    .update(values)
    .eq("id", target.id);

  if (error) {
    console.error("[forward-to-n8n] failed to update document state", {
      recordId: target.id,
      error: error.message,
    });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  console.log("[forward-to-n8n] request received", {
    method: req.method,
    hasWebhookUrl: Boolean(WEBHOOK_URL),
  });

  try {
    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!jwt) {
      console.error("[forward-to-n8n] missing bearer token");
      return new Response(
        JSON.stringify({ ok: false, error: "Missing bearer token" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      console.error("[forward-to-n8n] auth failed", {
        authError: authError?.message ?? null,
      });
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    console.log("[forward-to-n8n] user authenticated", { userId: user.id });

    const payload = (await req.json()) as ForwardPayload;
    let target: ReturnType<typeof resolveDocumentTarget>;
    try {
      target = resolveDocumentTarget(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(JSON.stringify({ ok: false, error: message }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const securedPayload = {
      ...payload,
      document_type: target.documentType,
      evaluation_id: target.kind === "evaluation" ? target.id : undefined,
      aggregate_id: target.kind === "aggregate" ? target.id : undefined,
      actor_user_id: user.id,
      callback_url: `${SUPABASE_URL}/functions/v1/document-generation-callback`,
      documents_bucket: DOCUMENTS_BUCKET,
    };

    console.log("[forward-to-n8n] forwarding payload", {
      subjectName: payload?.subject_name ?? null,
      orderNumber: payload?.order_number ?? null,
      hasEmail: Boolean(payload?.Email),
    });

    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(securedPayload),
    });

    console.log("[forward-to-n8n] n8n response received", {
      status: res.status,
      ok: res.ok,
    });

    if (!res.ok) {
      const text = await res.text();
      await updateDocument(target, {
        document_status: "failed",
        document_error: text.slice(0, 1000),
      });
      console.error("[forward-to-n8n] n8n returned non-2xx", {
        status: res.status,
        body: text,
      });
      return new Response(
        JSON.stringify({ ok: false, error: text }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const successText = await res.text();
    let parsedBody: unknown = null;

    try {
      parsedBody = successText ? JSON.parse(successText) : null;
    } catch {
      parsedBody = { raw: successText };
    }

    const docId = extractDocId(parsedBody);
    if (!docId) {
      return new Response(
        JSON.stringify({
          ok: true,
          status: "pending",
          evaluationId: target.kind === "evaluation" ? target.id : null,
          aggregateId: target.kind === "aggregate" ? target.id : null,
          message: "Workflow accepted. Waiting for async callback.",
        }),
        {
          status: 202,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    await updateDocument(target, {
      source_doc_id: docId,
      document_status: "ready",
      document_error: null,
    });

    console.log("[forward-to-n8n] success", {
      status: res.status,
      docId,
      bodyPreview: successText.slice(0, 300),
    });

    return new Response(
      JSON.stringify({
        ok: true,
        status: "ready",
        evaluationId: target.kind === "evaluation" ? target.id : null,
        aggregateId: target.kind === "aggregate" ? target.id : null,
        docId,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[forward-to-n8n] unhandled error", {
      message,
      stack: err instanceof Error ? err.stack ?? null : null,
    });

    return new Response(
      JSON.stringify({ ok: false, error: message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
