import { supabase } from "../lib/supabaseClient";
import type { Section } from "../config/sections";

type Scores = Record<string, Record<string, unknown>>;
type DocumentRow = { document_status?: string | null; pdf_storage_path?: string | null; docx_storage_path?: string | null };
export type DashboardEvaluation = DocumentRow & {
  id: number; video_case_id: string | null; analysis_kind?: string | null;
  subject_name?: string | null; order_number?: string | null; rubric: Scores | null; created_at: string;
};
type DashboardCase = { id: string; case_key: string; case_title: string; deleted_at: string | null };
type DashboardAggregate = DocumentRow & {
  id: string; video_case_id: string; source_count: number; status: string;
  combined_scores: Scores | null; created_at: string;
};
export type DashboardData = { cases: DashboardCase[]; evaluations: DashboardEvaluation[]; aggregates: DashboardAggregate[] };
export type DashboardActivity = {
  id: string; kind: "evaluation" | "aggregate"; title: string; videoCaseId: string | null;
  createdAt: string; average: number | null; sourceCount: number;
  documentStatus: string; resultPath: string; documentPath: string | null;
};

async function readAll<T>(table: string, columns: string, signal?: AbortSignal): Promise<T[]> {
  const result: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from(table).select(columns).order("id", { ascending: true });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    result.push(...(data ?? []) as unknown as T[]);
    if (!data || data.length < pageSize) return result;
  }
}

// Use the signed-in client and existing RLS for every dataset; never bypass
// visibility rules or infer access from a globally configured role.
export async function loadDashboardData(signal?: AbortSignal): Promise<DashboardData> {
  const [cases, evaluations, aggregates] = await Promise.all([
    readAll<DashboardCase>("video_cases", "id, case_key, case_title, deleted_at", signal),
    readAll<DashboardEvaluation>("evaluations", "id, video_case_id, analysis_kind, subject_name, order_number, rubric, created_at, document_status, pdf_storage_path, docx_storage_path", signal),
    readAll<DashboardAggregate>("video_case_aggregates", "id, video_case_id, source_count, status, combined_scores, created_at, document_status, pdf_storage_path, docx_storage_path", signal),
  ]);
  return { cases, evaluations, aggregates };
}

function documentReady(row: DocumentRow) {
  return row.document_status === "ready" && Boolean(row.pdf_storage_path || row.docx_storage_path);
}

function averageScores(scores: Scores | null): number | null {
  const values = Object.values(scores || {}).flatMap(section => Object.values(section || {}))
    .filter(value => typeof value === "number" || (typeof value === "string" && value.trim() !== ""))
    .map(Number).filter(value => Number.isFinite(value) && value >= 1 && value <= 5);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function buildDashboardModel(data: DashboardData) {
  const cases = new Map(data.cases.map(row => [row.id, row]));
  const isActive = (caseId: string | null) => !caseId || !cases.get(caseId)?.deleted_at;
  const evaluations = data.evaluations.filter(row => row.analysis_kind !== "aggregate" && isActive(row.video_case_id));
  const aggregates = data.aggregates.filter(row => isActive(row.video_case_id));
  const recent: DashboardActivity[] = [
    ...evaluations.map(row => ({
      id: `evaluation-${row.id}`, kind: "evaluation" as const,
      title: cases.get(row.video_case_id || "")?.case_title || row.subject_name || row.order_number || `#${row.id}`,
      videoCaseId: row.video_case_id, createdAt: row.created_at, average: averageScores(row.rubric), sourceCount: 1,
      documentStatus: row.document_status || "pending", resultPath: `/preview/${row.id}`,
      documentPath: documentReady(row) ? `/preview/${row.id}` : null,
    })),
    ...aggregates.map(row => ({
      id: `aggregate-${row.id}`, kind: "aggregate" as const,
      title: cases.get(row.video_case_id)?.case_title || cases.get(row.video_case_id)?.case_key || row.id,
      videoCaseId: row.video_case_id, createdAt: row.created_at, average: averageScores(row.combined_scores), sourceCount: row.source_count,
      documentStatus: row.document_status || "pending",
      resultPath: `/video-cases/${encodeURIComponent(row.video_case_id)}/summaries/${encodeURIComponent(row.id)}`,
      documentPath: documentReady(row) ? `/video-cases/${encodeURIComponent(row.video_case_id)}/summaries/${encodeURIComponent(row.id)}/preview` : null,
    })),
  ].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  return {
    caseCount: data.cases.filter(row => !row.deleted_at).length,
    evaluations, summaryCount: aggregates.length,
    readyDocumentCount: recent.filter(row => row.documentPath).length,
    recent,
  };
}

export function buildDashboardStats(evaluations: DashboardEvaluation[], sections: Section[]) {
  return sections.map(section => ({
    id: section.id, title: section.title,
    questions: section.questions.map(question => {
      // A legacy Thai label and q1 may coexist. Prefer the canonical storage
      // key, then the short ID, and count each evaluation only once.
      const values = evaluations.map(row => {
        const answers = row.rubric?.[section.id];
        const raw = answers?.[question.storageKey] ?? answers?.[question.id];
        return typeof raw === "number" || (typeof raw === "string" && raw.trim()) ? Number(raw) : NaN;
      }).filter(value => Number.isInteger(value) && value >= 1 && value <= 5);
      const scores: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      values.forEach(value => { scores[value]++; });
      return { id: question.id, label: question.label, count: values.length, scores,
        average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0 };
    }),
  }));
}
