import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DOCUMENTS_BUCKET = Deno.env.get("DOCUMENTS_BUCKET") || "evaluation-documents";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const authSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type ArtifactRequest = {
  evaluationId?: number;
};

type EvaluationRow = {
  id: number;
  user_id: string | null;
  pdf_storage_path: string | null;
  docx_storage_path: string | null;
};

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

  try {
    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!jwt) {
      return new Response(JSON.stringify({ ok: false, error: "Missing bearer token" }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const payload = (await req.json()) as ArtifactRequest;
    const evaluationId = payload.evaluationId;

    if (!evaluationId || !Number.isInteger(evaluationId)) {
      return new Response(JSON.stringify({ ok: false, error: "evaluationId is required" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const { data: roleRow } = await adminSupabase
      .from("user_information")
      .select("role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    const role = typeof roleRow?.role === "string" ? roleRow.role : "user";

    const { data, error } = await adminSupabase
      .from("evaluations")
      .select("id, user_id, pdf_storage_path, docx_storage_path")
      .eq("id", evaluationId)
      .maybeSingle();

    if (error || !data) {
      return new Response(JSON.stringify({ ok: false, error: "Evaluation not found" }), {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const evaluation = data as EvaluationRow;
    const canReadAll = role === "editor" || role === "admin";
    if (!canReadAll && evaluation.user_id !== user.id) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
        status: 403,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    if (evaluation.pdf_storage_path || evaluation.docx_storage_path) {
      const [pdfSigned, docxSigned] = await Promise.all([
        evaluation.pdf_storage_path
          ? adminSupabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(evaluation.pdf_storage_path, 60 * 60)
          : Promise.resolve({ data: null, error: null }),
        evaluation.docx_storage_path
          ? adminSupabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(evaluation.docx_storage_path, 60 * 60)
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (pdfSigned.error || docxSigned.error) {
        return new Response(JSON.stringify({
          ok: false,
          error: pdfSigned.error?.message || docxSigned.error?.message || "Failed to sign artifact URLs",
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        source: "storage",
        previewUrl: pdfSigned.data?.signedUrl ?? null,
        pdfUrl: pdfSigned.data?.signedUrl ?? null,
        docxUrl: docxSigned.data?.signedUrl ?? null,
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "No document artifacts available yet" }), {
      status: 404,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
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
