import { supabase } from "../lib/supabaseClient";
import { accountingService } from "./accountingService";
import type { AppRole } from "../lib/roles";

export type RoleRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type RoleRequestRow = {
  id: string;
  user_id: string;
  requested_role: AppRole;
  status: RoleRequestStatus;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

export class RoleRequestService {
  async requestRole(role: AppRole): Promise<RoleRequestRow> {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Authentication required.");
    }

    const { data, error } = await supabase
      .from("role_requests")
      .insert({
        user_id: user.id,
        requested_role: role,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    void accountingService
      .logActivity({
        user_id: user.id,
        action: "REQUEST_ROLE",
        resource: "role_requests",
        metadata: {
          request_id: data.id,
          requested_role: role,
        },
      })
      .catch((logError) => {
        console.error("Activity log failed:", logError);
      });

    return data as RoleRequestRow;
  }

  async getMyRequests(): Promise<RoleRequestRow[]> {
    const { data, error } = await supabase
      .from("role_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as RoleRequestRow[];
  }

  async adminGetAllRequests(): Promise<RoleRequestRow[]> {
    const { data, error } = await supabase
      .from("role_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as RoleRequestRow[];
  }

  async approveRequest(requestId: string): Promise<RoleRequestRow> {
    return this.review(requestId, "approved", "APPROVE_ROLE");
  }

  async rejectRequest(requestId: string): Promise<RoleRequestRow> {
    return this.review(requestId, "rejected", "REJECT_ROLE");
  }

  async cancelRequest(requestId: string): Promise<RoleRequestRow> {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Authentication required.");
    }

    const { data, error } = await supabase
      .from("role_requests")
      .update({
        status: "cancelled",
        reviewed_by: null,
        reviewed_at: null,
      })
      .eq("id", requestId)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    void accountingService
      .logActivity({
        user_id: user.id,
        action: "CANCEL_ROLE_REQUEST",
        resource: "role_requests",
        metadata: {
          request_id: requestId,
          requested_role: data.requested_role,
          status: data.status,
        },
      })
      .catch((logError) => {
        console.error("Activity log failed:", logError);
      });

    return data as RoleRequestRow;
  }

  private async review(
    requestId: string,
    status: "approved" | "rejected",
    action: "APPROVE_ROLE" | "REJECT_ROLE",
  ): Promise<RoleRequestRow> {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Authentication required.");
    }

    const { data, error } = await supabase.rpc("review_role_request", {
      p_request_id: requestId,
      p_status: status,
    });

    if (error) {
      throw new Error(error.message);
    }

    const reviewed = data as RoleRequestRow;

    void accountingService
      .logActivity({
        user_id: user.id,
        action,
        resource: "role_requests",
        metadata: {
          request_id: requestId,
          target_user_id: reviewed.user_id,
          requested_role: reviewed.requested_role,
          status: reviewed.status,
        },
      })
      .catch((logError) => {
        console.error("Activity log failed:", logError);
      });

    return reviewed;
  }
}

export const roleRequestService = new RoleRequestService();
