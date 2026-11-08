const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function uniquePaths(...paths) {
  return [...new Set(paths.filter((path) => typeof path === "string" && path.trim() !== ""))];
}

// A file may be shared by another evaluation or summary; only remove what nothing else points at.
export function removablePaths(candidates, stillReferenced) {
  const kept = new Set(stillReferenced);
  return candidates.filter((path) => !kept.has(path));
}

export function classifyDeleteError(error) {
  const code = String(error?.code ?? "");
  if (code === "23503") return "in_use";
  if (code === "42501") return "forbidden";
  return "delete_failed";
}

/**
 * The row is deleted with the caller's own JWT so the existing RLS policies decide who may delete.
 * Storage files are removed with the service role only after that delete succeeded, so a refused
 * delete (for example a summary still uses the evaluation) never costs the user their documents.
 */
export function createDeleteEvaluationHandler({
  authenticate,
  readEvaluation,
  deleteAsUser,
  findOtherReferences,
  removeFiles,
}) {
  return async function handleDeleteEvaluation(req) {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { ok: false, reason: "method_not_allowed" });

    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
    if (!jwt) return json(401, { ok: false, reason: "unauthorized" });

    try {
      const user = await authenticate(jwt);
      if (!user) return json(401, { ok: false, reason: "unauthorized" });

      const payload = await req.json().catch(() => ({}));
      const evaluationId = payload?.evaluationId;
      if (!Number.isInteger(evaluationId) || evaluationId <= 0) {
        return json(400, { ok: false, reason: "invalid_request" });
      }

      const evaluation = await readEvaluation(evaluationId);
      if (!evaluation) return json(404, { ok: false, reason: "not_found" });

      const { deletedCount, error } = await deleteAsUser(jwt, evaluationId);
      if (error) {
        const reason = classifyDeleteError(error);
        const status = reason === "in_use" ? 409 : reason === "forbidden" ? 403 : 500;
        return json(status, { ok: false, reason });
      }
      // RLS filters rows silently, so zero deleted rows means the caller may not delete it.
      if (deletedCount === 0) return json(403, { ok: false, reason: "forbidden" });

      const candidates = uniquePaths(evaluation.pdf_storage_path, evaluation.docx_storage_path);
      let filesRemoved = 0;
      let cleanupFailed = false;
      if (candidates.length > 0) {
        try {
          const referenced = await findOtherReferences(candidates);
          const toRemove = removablePaths(candidates, referenced);
          if (toRemove.length > 0) filesRemoved = await removeFiles(toRemove);
        } catch (cleanupError) {
          // The row is already gone; report the leftover files instead of failing the whole request.
          console.error("delete-evaluation storage cleanup failed", cleanupError);
          cleanupFailed = true;
        }
      }

      return json(200, { ok: true, reason: "deleted", filesRemoved, cleanupFailed });
    } catch (error) {
      console.error("delete-evaluation failed", error);
      return json(500, { ok: false, reason: "delete_failed" });
    }
  };
}
