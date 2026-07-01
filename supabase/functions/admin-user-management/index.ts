import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

type AppRole = "user" | "editor" | "admin";

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
  return value === "editor" || value === "admin" ? value : "user";
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
    if (actorRole !== "admin") {
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

    if (action === "update_role") {
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
