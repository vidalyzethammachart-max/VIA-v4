import { supabase } from "../lib/supabaseClient";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];

export type ActivityEvent = {
  user_id: string;
  action: string;
  resource?: string;
  metadata?: JsonValue;
};

const MAX_ACTION_LENGTH = 120;
const MAX_RESOURCE_LENGTH = 120;

function sanitizeJson(input: unknown): JsonValue {
  if (
    input === null ||
    typeof input === "string" ||
    typeof input === "number" ||
    typeof input === "boolean"
  ) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeJson(item));
  }

  if (typeof input === "object") {
    const output: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") {
        continue;
      }
      output[key] = sanitizeJson(value);
    }
    return output;
  }

  return String(input);
}

export class AccountingService {
  async logActivity(event: ActivityEvent): Promise<void> {
    const action = event.action.trim();
    if (!action || action.length > MAX_ACTION_LENGTH) {
      throw new Error("Invalid action. Must be 1-120 characters.");
    }

    const resource = event.resource?.trim() || null;
    if (resource && resource.length > MAX_RESOURCE_LENGTH) {
      throw new Error("Invalid resource. Must be <= 120 characters.");
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error("Cannot log activity without an authenticated user.");
    }

    if (event.user_id !== user.id) {
      throw new Error("User spoofing detected: event.user_id does not match authenticated user.");
    }

    const metadata = sanitizeJson(event.metadata ?? {});

    const { error: rpcError } = await supabase.rpc("log_activity", {
      p_action: action,
      p_resource: resource,
      p_metadata: metadata,
    });

    if (!rpcError) {
      return;
    }

    // Fallback for local/dev environments where RPC may not be deployed yet.
    const { error: insertError } = await supabase.from("activity_logs").insert({
      user_id: user.id,
      action,
      resource,
      metadata,
    });

    if (insertError) {
      throw new Error(`Failed to log activity. rpc=${rpcError.message}; insert=${insertError.message}`);
    }
  }
}

export const accountingService = new AccountingService();
