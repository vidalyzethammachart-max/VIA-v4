import type { VideoCaseEvaluationRow } from "./videoCaseService";

export function getEvaluationAverage(run: VideoCaseEvaluationRow): number | null {
  const scores = Object.values(run.rubric || {})
    .flatMap((section) =>
      section && typeof section === "object" && !Array.isArray(section)
        ? Object.values(section)
        : [],
    )
    .map((value) => (typeof value === "string" ? Number(value) : value))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (scores.length === 0) return null;

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "กำลังดำเนินการ",
    ready: "พร้อมใช้งาน",
    failed: "ไม่สำเร็จ",
  };

  return labels[status] || status;
}
