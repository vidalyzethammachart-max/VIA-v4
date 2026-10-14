import { supabase } from "../lib/supabaseClient";
import { normalizeRole } from "../lib/roles";
import type { VideoCaseRow } from "./videoCaseService";

export function validateCaseVideo(file: File): string | null {
  if (!/\.(mp4|m4v|mov|webm)$/i.test(file.name)) return "รองรับไฟล์ MP4, M4V, MOV หรือ WebM";
  if (file.size <= 0) return "ไฟล์วิดีโอว่าง กรุณาเลือกไฟล์ใหม่";
  if (file.size > 1024 ** 3) return "ไฟล์วิดีโอต้องมีขนาดไม่เกิน 1GB";
  return null;
}

export async function updateVideoCase(input: {
  id: string;
  expectedUpdatedAt: string;
  caseTitle: string;
  description: string;
  videoFile?: File | null;
}): Promise<VideoCaseRow> {
  const title = input.caseTitle.trim();
  if (!title) throw new Error("กรุณาระบุชื่อเคส");
  if (!input.expectedUpdatedAt) throw new Error("กรุณาโหลดข้อมูลเคสใหม่ก่อนแก้ไข");
  if (input.videoFile) {
    const error = validateCaseVideo(input.videoFile);
    if (error) throw new Error(error);
  }
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("กรุณาเข้าสู่ระบบอีกครั้ง");
  const { data: current, error: readError } = await supabase.from("video_cases")
    .select("id, created_by, updated_at, deleted_at").eq("id", input.id).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!current) throw new Error("ไม่พบเคสหรือคุณไม่มีสิทธิ์เข้าถึง");
  if (current.deleted_at) throw new Error("เคสอยู่ในถังขยะ กรุณากู้คืนก่อนแก้ไข");
  if (current.created_by !== auth.user.id) {
    const { data: profile, error } = await supabase.from("user_information")
      .select("role").eq("auth_user_id", auth.user.id).maybeSingle();
    if (error || normalizeRole(profile?.role) !== "admin") {
      throw new Error("เฉพาะผู้สร้างเคสหรือแอดมินเท่านั้นที่แก้ไขได้");
    }
  }
  if (current.updated_at !== input.expectedUpdatedAt) {
    throw new Error("เคสนี้มีการเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนแก้ไขอีกครั้ง");
  }
  const patch: Record<string, unknown> = {
    case_title: title,
    title,
    description: input.description.trim() || null,
  };
  if (input.videoFile) {
    const file = input.videoFile;
    const endpoint = new URL(import.meta.env.VITE_UPLOAD_VIDEO_API_URL || window.location.origin, window.location.origin);
    endpoint.pathname = "/api/r2-presign-upload";
    endpoint.search = "";
    endpoint.hash = "";
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size, userId: auth.user.id, evaluationId: input.id }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`เตรียมอัปโหลดวิดีโอไม่สำเร็จ (${response.status}) กรุณาลองอีกครั้ง`);
    const presign = await response.json();
    if (presign.provider !== "cloudflare-r2" || !presign.objectKey || !presign.uploadUrl) {
      throw new Error("ระบบอัปโหลดส่งข้อมูลไม่ครบ กรุณาลองอีกครั้ง");
    }
    const uploaded = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
      signal: AbortSignal.timeout(15 * 60_000),
    });
    if (!uploaded.ok) throw new Error(`อัปโหลดวิดีโอไม่สำเร็จ (${uploaded.status}) ข้อมูลเคสยังไม่ถูกเปลี่ยน`);
    Object.assign(patch, {
      source_file_name: file.name, video_name: file.name,
      video_object_key: presign.objectKey,
      // Signed download URLs expire; keep the durable object key instead.
      video_download_url: null,
    });
  }
  // RLS enforces creator/admin access. Match the version too so a concurrent
  // edit during a long upload cannot silently overwrite somebody else's work.
  const { data, error } = await supabase.from("video_cases").update(patch)
    .eq("id", input.id).eq("updated_at", input.expectedUpdatedAt).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("บันทึกไม่ได้ เคสอาจถูกแก้ไขหรือสิทธิ์ของคุณเปลี่ยนไป กรุณาโหลดข้อมูลล่าสุด");
  return data as VideoCaseRow;
}
