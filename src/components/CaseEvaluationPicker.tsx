import { getCombineBlockReason, isCombinableEvaluation } from "../services/videoCaseCombineSelectionCore.js";
import { getEvaluationAverage, getStatusLabel } from "../services/videoCaseEvaluationDisplay";
import type { VideoCaseEvaluationRow } from "../services/videoCaseService";

type Props = {
  analyses: Array<VideoCaseEvaluationRow & { video_cases?: { case_key: string; case_title: string | null } | null }>;
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  // Optional overrides for callers that show a filtered list but select from a larger one.
  blockReason?: string | null;
  selectedCount?: number;
};

// Checklist of a case's evaluations; only evaluations that finished (ready) can be selected.
export default function CaseEvaluationPicker({ analyses, selectedIds, onChange, disabled = false, blockReason: blockReasonOverride, selectedCount }: Props) {
  const reason = blockReasonOverride !== undefined ? blockReasonOverride : getCombineBlockReason(analyses, selectedIds);

  if (analyses.length === 0) {
    return <p className="text-sm text-slate-500">ยังไม่มีแบบประเมินในเคสนี้</p>;
  }

  return (
    <div>
      <p className="text-sm font-semibold text-slate-800">เลือกแบบประเมินที่จะรวม ({selectedCount ?? selectedIds.length} รายการ)</p>
      {reason && <p className="mt-1 text-sm text-amber-700">{reason}</p>}
      <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
        {analyses.map((run) => {
          const combinable = isCombinableEvaluation(run);
          const score = getEvaluationAverage(run);
          return (
            <li key={run.id} className="flex items-start gap-3 bg-white px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={combinable && selectedIds.includes(run.id)}
                disabled={disabled || !combinable}
                title={combinable ? undefined : "แบบประเมินนี้ยังไม่พร้อม จึงนำมารวมผลไม่ได้"}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...new Set([...selectedIds, run.id])]
                      : selectedIds.filter((id) => id !== run.id),
                  )
                }
                aria-label={`เลือกแบบประเมิน #${run.id} เพื่อรวมผล`}
                className="mt-1 h-5 w-5 shrink-0 accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
              />
              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold text-slate-900">{run.subject_name || "ไม่มีชื่อหัวข้อ"}</p>
                <p className="mt-1 text-xs text-slate-500">
                  #{run.id} · ผู้ประเมิน {run.employee_number || "ไม่ระบุรหัส"} ·{" "}
                  {new Date(run.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                </p>
                {run.video_cases && (
                  <p className="mt-1 break-words text-xs font-medium text-[#04418b]">{run.video_cases.case_title || run.video_cases.case_key}</p>
                )}
                {run.overall_suggestion?.trim() && (
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-slate-600">{run.overall_suggestion.trim()}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-bold text-[#04418b]">{score === null ? "-" : score.toFixed(1)}</p>
                <p className="mt-1 text-xs text-slate-500">{getStatusLabel(run.document_status)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
