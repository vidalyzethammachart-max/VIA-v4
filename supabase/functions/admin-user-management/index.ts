import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAdminRole } from "../_shared/roleAccess.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const authSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// "super_admin" is only ever read from the database here; it is never accepted from a request.
type AppRole = "user" | "editor" | "admin" | "super_admin";

type AdminActionPayload =
  | {
      action?: "update_role";
      targetAuthUserId?: string;
      role?: AppRole;
    }
  | {
      action?: "delete_user";
      targetAuthUserId?: string;
    };

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeRole(value: unknown): AppRole {
  return value === "editor" || value === "admin" || value === "super_admin" ? value : "user";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!jwt) {
      return jsonResponse(401, { ok: false, error: "Missing bearer token" });
    }

    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser(jwt);

    if (authError || !user) {
      return jsonResponse(401, { ok: false, error: "Unauthorized" });
    }

    const { data: roleRow } = await adminSupabase
      .from("user_information")
      .select("role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    const actorRole = normalizeRole(roleRow?.role);
    if (!isAdminRole(actorRole)) {
      return jsonResponse(403, { ok: false, error: "Admin permission required" });
    }

    const payload = (await req.json()) as AdminActionPayload;
    const action = payload.action;
    const targetAuthUserId =
      typeof payload.targetAuthUserId === "string" ? payload.targetAuthUserId.trim() : "";

    if (!targetAuthUserId) {
      return jsonResponse(400, { ok: false, error: "targetAuthUserId is required" });
    }

    if (targetAuthUserId === user.id) {
      return jsonResponse(400, { ok: false, error: "You cannot manage your own admin account here" });
    }

    // The super admin is protected: it cannot be modified or deleted here, and nobody can be
    // promoted to it from the app (only the database owner can, see the guard trigger).
    if (action === "update_role" || action === "delete_user") {
      const { data: targetRow, error: targetError } = await adminSupabase
        .from("user_information")
        .select("role")
        .eq("auth_user_id", targetAuthUserId)
        .maybeSingle();
      if (targetError) {
        return jsonResponse(500, { ok: false, error: targetError.message });
      }
      if (targetRow?.role === "super_admin") {
        return jsonResponse(403, { ok: false, error: "Cannot modify the super admin" });
      }
    }

    if (action === "update_role") {
      if ((payload as { role?: unknown }).role === "super_admin") {
        return jsonResponse(403, { ok: false, error: "Cannot assign super_admin" });
      }
      const nextRole = normalizeRole(payload.role);

      const { error } = await adminSupabase
        .from("user_information")
        .update({ role: nextRole })
        .eq("auth_user_id", targetAuthUserId);

      if (error) {
        return jsonResponse(500, { ok: false, error: error.message });
      }

      return jsonResponse(200, {
        ok: true,
        action,
        targetAuthUserId,
        role: nextRole,
      });
    }

    if (action === "delete_user") {
      // video_cases.created_by references auth.users ON DELETE RESTRICT, so a
      // creator cannot be removed from Auth. Check first so we never delete
      // profile data and then fail on the Auth step.
      const { data: ownedCases, error: ownedCasesError } = await adminSupabase
        .from("video_cases")
        .select("id")
        .eq("created_by", targetAuthUserId)
        .limit(1);

      if (ownedCasesError) {
        return jsonResponse(500, { ok: false, error: ownedCasesError.message });
      }

      if (ownedCases && ownedCases.length > 0) {
        return jsonResponse(409, {
          ok: false,
          error: "This user created video cases. Transfer or remove those video cases before deleting the account.",
        });
      }

      await adminSupabase.from("activity_logs").delete().eq("user_id", targetAuthUserId);
      await adminSupabase.from("evaluations").delete().eq("user_id", targetAuthUserId);
      await adminSupabase.from("role_requests").delete().eq("user_id", targetAuthUserId);
      await adminSupabase.from("user_information").delete().eq("auth_user_id", targetAuthUserId);

      await adminSupabase.storage
        .from("profile-avatars")
        .remove([`${targetAuthUserId}/avatar.jpg`]);

      const { error } = await adminSupabase.auth.admin.deleteUser(targetAuthUserId);

      if (error) {
        return jsonResponse(500, { ok: false, error: error.message });
      }

      return jsonResponse(200, {
        ok: true,
        action,
        targetAuthUserId,
      });
    }

    return jsonResponse(400, { ok: false, error: "Unsupported action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(500, { ok: false, error: message });
  }
});
