import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createDeleteEvaluationHandler } from "../_shared/evaluationDelete.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DOCUMENTS_BUCKET = Deno.env.get("DOCUMENTS_BUCKET") || "evaluation-documents";

const authSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(createDeleteEvaluationHandler({
  async authenticate(jwt: string) {
    const { data: { user }, error } = await authSupabase.auth.getUser(jwt);
    return error ? null : user;
  },

  async readEvaluation(id: number) {
    const { data, error } = await adminSupabase
      .from("evaluations")
      .select("id, pdf_storage_path, docx_storage_path")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  // Runs as the signed-in user so RLS (owner, case leader or admin) decides.
  async deleteAsUser(jwt: string, id: number) {
    const userSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await userSupabase.from("evaluations").delete().eq("id", id).select("id");
    return { deletedCount: data?.length ?? 0, error };
  },

  async findOtherReferences(paths: string[]) {
    const list = paths.map((path) => `"${path.replaceAll('"', '\\"')}"`).join(",");
    const filter = `pdf_storage_path.in.(${list}),docx_storage_path.in.(${list})`;
    const [evaluations, aggregates] = await Promise.all([
      adminSupabase.from("evaluations").select("pdf_storage_path, docx_storage_path").or(filter),
      adminSupabase.from("video_case_aggregates").select("pdf_storage_path, docx_storage_path").or(filter),
    ]);
    if (evaluations.error) throw evaluations.error;
    if (aggregates.error) throw aggregates.error;
    return [...(evaluations.data ?? []), ...(aggregates.data ?? [])]
      .flatMap((row) => [row.pdf_storage_path, row.docx_storage_path])
      .filter((path): path is string => typeof path === "string");
  },

  async removeFiles(paths: string[]) {
    const { data, error } = await adminSupabase.storage.from(DOCUMENTS_BUCKET).remove(paths);
    if (error) throw error;
    return data?.length ?? 0;
  },
}));
