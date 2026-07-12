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
  aggregateId?: string;
};

type EvaluationRow = {
  id: number;
  user_id: string | null;
  pdf_storage_path: string | null;
  docx_storage_path: string | null;
};

type AggregateRow = {
  id: string;
  video_case_id: string;
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
    const aggregateId = typeof payload.aggregateId === "string" ? payload.aggregateId : null;

    if ((!evaluationId || !Number.isInteger(evaluationId)) && !aggregateId) {
      return new Response(JSON.stringify({ ok: false, error: "evaluationId or aggregateId is required" }), {
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

    const canReadAll = role === "editor" || role === "admin";
    let pdfPath: string | null = null;
    let docxPath: string | null = null;

    if (aggregateId) {
      const { data, error } = await adminSupabase
        .from("video_case_aggregates")
        .select("id, video_case_id, pdf_storage_path, docx_storage_path")
        .eq("id", aggregateId)
        .maybeSingle();
      const aggregate = data as AggregateRow | null;
      if (error || !aggregate) {
        return new Response(JSON.stringify({ ok: false, error: "Aggregate not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!canReadAll) {
        const { data: membership } = await adminSupabase
          .from("video_case_members")
          .select("id")
          .eq("video_case_id", aggregate.video_case_id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!membership) {
          return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
      pdfPath = aggregate.pdf_storage_path;
      docxPath = aggregate.docx_storage_path;
    } else {
      const { data, error } = await adminSupabase
        .from("evaluations")
        .select("id, user_id, pdf_storage_path, docx_storage_path")
        .eq("id", evaluationId)
        .maybeSingle();
      const evaluation = data as EvaluationRow | null;
      if (error || !evaluation) {
        return new Response(JSON.stringify({ ok: false, error: "Evaluation not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!canReadAll && evaluation.user_id !== user.id) {
        return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      pdfPath = evaluation.pdf_storage_path;
      docxPath = evaluation.docx_storage_path;
    }

    if (pdfPath || docxPath) {
      const [pdfSigned, docxSigned] = await Promise.all([
        pdfPath
          ? adminSupabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(pdfPath, 60 * 60)
          : Promise.resolve({ data: null, error: null }),
        docxPath
          ? adminSupabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(docxPath, 60 * 60)
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
