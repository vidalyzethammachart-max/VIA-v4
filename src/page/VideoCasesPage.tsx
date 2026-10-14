import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import ConfirmModal from "../components/ConfirmModal";
import MainNavbar from "../components/MainNavbar";
import VideoCaseEditor from "../components/VideoCaseEditor";
import { buildVideoCaseSummaryDocumentPreviewPath } from "../services/videoCaseSummaryDocumentPreviewCore.js";
import { normalizeRole, type AppRole } from "../lib/roles";
import { supabase } from "../lib/supabaseClient";
import {
  combineVideoCaseAnalyses,
  deleteVideoCaseEvaluation,
  getMyVideoCases,
  getVideoCaseAggregates,
  getVideoCaseAnalyses,
  getVideoCaseMembership,
  resolveVideoCaseMembership,
  setVideoCaseTrashed,
  type VideoCaseAggregateRow,
  type VideoCaseEvaluationRow,
  type VideoCaseMemberRole,
  type VideoCaseRow,
} from "../services/videoCaseService";

function getAiSummary(output: unknown, rawText: string | null): string {
  if (typeof output === "string" && output.trim()) return output;
  if (!output || typeof output !== "object") return rawText || "No AI analysis available.";

  const record = output as Record<string, unknown>;
  const preferredKeys = [
    "summary",
    "overall_summary",
    "overallSummary",
    "executive_summary",
    "executiveSummary",
    "final_report",
    "finalReport",
    "report",
    "feedback",
  ];
  for (const key of preferredKeys) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key];
  }

  for (const nestedKey of ["analysis", "result", "data"]) {
    const nested = record[nestedKey];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const summary = getAiSummary(nested, null);
      if (summary !== "No AI analysis available.") return summary;
    }
  }

  return rawText || "Structured AI analysis is available. Open details to inspect it.";
}

function getAiOutputText(run: VideoCaseEvaluationRow): string {
  return getAiSummary(run.analysis_ai_output, run.analysis_ai_raw_text);
}

function getEvaluationAverage(run: VideoCaseEvaluationRow): number | null {
  const scores = Object.values(run.rubric || {})
    .flatMap((section) =>
      section && typeof section === "object" && !Array.isArray(section)
        ? Object.values(section)
        : [],
    )
    .map((value) => (typeof value === "string" ? Number(value) : value))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (scores.length === 0) {
    return null;
  }

  const total = scores.reduce((sum, score) => sum + score, 0);
  return total / scores.length;
}

export default function VideoCasesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedCaseId = searchParams.get("caseId")?.trim() || "";
  const requestedSummaryId = searchParams.get("summaryId")?.trim() || searchParams.get("aggregateId")?.trim() || "";
  const [loading, setLoading] = useState(true);
  const [appRole, setAppRole] = useState<AppRole>("user");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingCase, setEditingCase] = useState<VideoCaseRow | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [caseToTrash, setCaseToTrash] = useState<VideoCaseRow | null>(null);
  const [changingTrash, setChangingTrash] = useState(false);
  const trashBusy = useRef(false);
  const listRequest = useRef(0);
  const detailsRequest = useRef(0);
  const [cases, setCases] = useState<VideoCaseRow[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<VideoCaseMemberRole | null>(null);
  const [analyses, setAnalyses] = useState<VideoCaseEvaluationRow[]>([]);
  const [aggregates, setAggregates] = useState<VideoCaseAggregateRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [caseKey, setCaseKey] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [combining, setCombining] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showCreateValidation, setShowCreateValidation] = useState(false);
  const [selectedAnalysisIds, setSelectedAnalysisIds] = useState<number[]>([]);
  const [evaluationToDelete, setEvaluationToDelete] = useState<VideoCaseEvaluationRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selectedCase = useMemo(
    () => cases.find((item) => item.id === selectedCaseId) ?? null,
    [cases, selectedCaseId],
  );

  const effectiveCaseRole: VideoCaseMemberRole =
    appRole === "admin" ? "leader" : (selectedRole ?? "member");
  const canCombine = effectiveCaseRole === "leader";
  const selectedAnalyses = useMemo(
    () => analyses.filter((run) => selectedAnalysisIds.includes(run.id)),
    [analyses, selectedAnalysisIds],
  );
  const isCaseKeyInvalid = showCreateValidation && !caseKey.trim();
  const isCaseTitleInvalid = showCreateValidation && !caseTitle.trim();

  const loadCases = useCallback(async () => {
    const request = ++listRequest.current;
    try {
      setLoading(true);
      setErrorMessage(null);
      const data = await getMyVideoCases({ trashed: showTrash });
      if (request !== listRequest.current) return;
      setCases(data);
      if (requestedCaseId && data.some((item) => item.id === requestedCaseId)) {
        setSelectedCaseId(requestedCaseId);
        return;
      }
      setSelectedCaseId((previous) => data.some((item) => item.id === previous) ? previous : data[0]?.id || "");
    } catch (error) {
      if (request === listRequest.current) setErrorMessage(error instanceof Error ? error.message : "Failed to load video cases.");
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [requestedCaseId, showTrash]);

  const loadCaseData = useCallback(async (videoCaseId: string) => {
    const request = ++detailsRequest.current;
    setAnalyses([]);
    setAggregates([]);
    setSelectedRole(null);
    try {
      const [membership, analysisRows, aggregateRows] = await Promise.all([
        getVideoCaseMembership(videoCaseId),
        getVideoCaseAnalyses(videoCaseId),
        getVideoCaseAggregates(videoCaseId),
      ]);

      if (request !== detailsRequest.current) return;
      setSelectedRole(membership?.member_role ?? null);
      setAnalyses(analysisRows);
      setAggregates(aggregateRows);
      setSelectedAnalysisIds(analysisRows.map((run) => run.id));
    } catch (error) {
      if (request === detailsRequest.current) setErrorMessage(error instanceof Error ? error.message : "Failed to load case details.");
    }
  }, []);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setCurrentUserId(user.id);

      void supabase
        .from("user_information")
        .select("role")
        .eq("auth_user_id", user.id)
        .maybeSingle()
        .then(({ data }) => setAppRole(normalizeRole(data?.role)));
    });
  }, []);

  useEffect(() => {
    void loadCases();
    return () => { listRequest.current++; };
  }, [loadCases]);

  useEffect(() => {
    if (!selectedCaseId && cases[0]?.id) {
      setSelectedCaseId(cases[0].id);
    }
  }, [cases, selectedCaseId]);

  useEffect(() => {
    if (!selectedCaseId) {
      detailsRequest.current++;
      setAnalyses([]);
      setAggregates([]);
      setSelectedRole(null);
      setSelectedAnalysisIds([]);
      return;
    }

    void loadCaseData(selectedCaseId);
    return () => { detailsRequest.current++; };
  }, [loadCaseData, selectedCaseId]);

  function switchCaseList(trashed: boolean) {
    if (trashBusy.current || trashed === showTrash) return;
    listRequest.current++;
    detailsRequest.current++;
    setCases([]);
    setSelectedCaseId("");
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowTrash(trashed);
  }

  async function handleTrashChange(videoCase: VideoCaseRow, trashed: boolean) {
    if (trashBusy.current) return;
    trashBusy.current = true;
    setChangingTrash(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await setVideoCaseTrashed(videoCase.id, trashed);
      setCases((previous) => previous.filter((item) => item.id !== videoCase.id));
      setSelectedCaseId((previous) => previous === videoCase.id ? "" : previous);
      setSuccessMessage(trashed ? "ย้ายเคสเข้าถังขยะแล้ว ผลประเมินและรายงานเดิมยังอยู่ สามารถกู้คืนได้" : "กู้คืนเคสแล้ว ดูได้ในแท็บเคสที่ใช้งาน");
      setCaseToTrash(null);
    } catch (error) {
      setCaseToTrash(null);
      setErrorMessage(error instanceof Error ? error.message : "เปลี่ยนสถานะเคสไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      trashBusy.current = false;
      setChangingTrash(false);
    }
  }

  async function handleResolveCase() {
    if (!caseKey.trim()) {
      setShowCreateValidation(true);
      setErrorMessage("กรุณาระบุรหัสเคสและชื่อเคส");
      return;
    }
    if (!caseTitle.trim()) {
      setShowCreateValidation(true);
      setErrorMessage("กรุณาระบุรหัสเคสและชื่อเคส");
      return;
    }

    try {
      setCreating(true);
      setShowCreateValidation(false);
      setErrorMessage(null);
      const resolved = await resolveVideoCaseMembership({
        caseKey: caseKey.trim(),
        caseTitle: caseTitle.trim() || null,
        sourceFileName: null,
        videoObjectKey: null,
        memberRole: "member",
      });

      setSuccessMessage(`Case ${resolved.case_key} is ready.`);
      setSelectedCaseId(resolved.id);
      setCaseKey("");
      setCaseTitle("");
      await loadCases();
      await loadCaseData(resolved.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to resolve case.");
    } finally {
      setCreating(false);
    }
  }

  async function handleCombine() {
    if (!selectedCase) {
      setErrorMessage("Select a case first.");
      return;
    }

    if (selectedAnalyses.length === 0) {
      setErrorMessage("Select at least one evaluation to combine.");
      return;
    }

    try {
      setCombining(true);
      setErrorMessage(null);
      const aggregate = await combineVideoCaseAnalyses({
        videoCaseId: selectedCase.id,
        caseTitle: selectedCase.case_title || selectedCase.case_key,
        sourceRuns: selectedAnalyses.map((run) => ({
          id: run.id,
          user_id: run.user_id,
          employee_number: run.employee_number,
          evaluation_id: run.id,
          run_kind: run.analysis_kind,
          rubric: run.rubric,
          matrix:
            ((run.analysis_ai_output as Record<string, unknown> | null)?.analysis as Record<string, unknown> | undefined)?.quality_scores ||
            (run.analysis_ai_output as Record<string, unknown> | null)?.quality_scores ||
            {},
          ai_output: run.analysis_ai_output,
          ai_raw_text: run.analysis_ai_raw_text,
          notes: run.overall_suggestion,
          created_at: run.created_at,
          order_number: run.order_number,
        })),
        prompt: prompt.trim() || undefined,
      });

      navigate(`/video-cases/${selectedCase.id}/summaries/${aggregate.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to combine analyses.");
    } finally {
      setCombining(false);
      setConfirmOpen(false);
    }
  }

  async function handleDeleteEvaluation() {
    if (!selectedCase || !evaluationToDelete) return;

    try {
      setDeleting(true);
      setErrorMessage(null);
      await deleteVideoCaseEvaluation(evaluationToDelete.id);
      setSuccessMessage(`Evaluation #${evaluationToDelete.id} was deleted.`);
      await loadCaseData(selectedCase.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete evaluation.");
    } finally {
      setDeleting(false);
      setEvaluationToDelete(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
      <ConfirmModal
        isOpen={Boolean(caseToTrash)}
        title="ย้ายเคสเข้าถังขยะ"
        message={`ย้ายเคส “${caseToTrash?.case_title || caseToTrash?.case_key || ""}” (${caseToTrash?.case_key || ""}) เข้าถังขยะหรือไม่? ผลประเมิน รายงาน และวิดีโอเดิมจะถูกเก็บไว้ และสามารถกู้คืนได้`}
        onCancel={() => { if (!trashBusy.current) setCaseToTrash(null); }}
        onConfirm={() => { if (caseToTrash) void handleTrashChange(caseToTrash, true); }}
        confirmLabel="ย้ายเข้าถังขยะ" cancelLabel="ยกเลิก" confirmDisabled={changingTrash}
      />
      {editingCase && (
        <VideoCaseEditor key={editingCase.id} videoCase={editingCase}
          onCancel={() => setEditingCase(null)}
          onSaved={(updated) => {
            setCases((previous) => previous.map((item) => item.id === updated.id ? updated : item));
            setEditingCase(null);
            setErrorMessage(null);
            setSuccessMessage("บันทึกข้อมูลเคสเรียบร้อยแล้ว");
          }}
        />
      )}
      <ConfirmModal
        isOpen={confirmOpen}
        title="รวมผลและวิเคราะห์ใหม่"
        message={`AI will combine ${selectedAnalyses.length} selected evaluation(s) for this case.`}
        variant="primary"
        onCancel={() => {
          if (!combining) setConfirmOpen(false);
        }}
        onConfirm={() => void handleCombine()}
        confirmLabel="รวมผล"
        cancelLabel="ยกเลิก"
        confirmDisabled={combining}
      />
      <ConfirmModal
        isOpen={Boolean(evaluationToDelete)}
        title="Delete evaluation"
        message={`Delete evaluation #${evaluationToDelete?.id ?? ""}? This cannot be undone.`}
        variant="danger"
        onCancel={() => {
          if (!deleting) setEvaluationToDelete(null);
        }}
        onConfirm={() => void handleDeleteEvaluation()}
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        cancelLabel="Cancel"
        confirmDisabled={deleting}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 md:py-8">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">จัดการ Video Case</h2>
            <p className="mt-1 text-sm text-slate-500">
              ใช้สำหรับสร้างหรือเข้าร่วมเคส ดูผลวิเคราะห์รายคน และให้หัวหน้ารวมผลเพื่อสรุปใหม่
            </p>
          </div>
          <Link to="/form-submit" className="btn-secondary text-center">
            ไปหน้ากรอกประเมิน
          </Link>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        )}

        <div className="mb-4 flex gap-2" role="group" aria-label="รายการ Video Case">
          <button type="button" aria-pressed={!showTrash} disabled={changingTrash} className={!showTrash ? "btn-primary" : "btn-secondary"} onClick={() => switchCaseList(false)}>เคสที่ใช้งาน</button>
          <button type="button" aria-pressed={showTrash} disabled={changingTrash} className={showTrash ? "btn-primary" : "btn-secondary"} onClick={() => switchCaseList(true)}>ถังขยะ</button>
        </div>
        {showTrash && <p className="mb-4 text-sm text-slate-500">เคสในถังขยะยังเก็บผลประเมิน รายงาน และวิดีโอไว้ ผู้สร้างเคสหรือแอดมินสามารถกู้คืนเพื่อใช้งานต่อได้</p>}
        <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-5 p-5 md:flex-row md:items-start md:justify-between md:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#04418b]">Current video case</p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">
                {selectedCase?.case_title || selectedCase?.case_key || "No video case selected"}
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                {selectedCase ? `Case key: ${selectedCase.case_key}` : "Choose a case below to view its reviews and combined analysis."}
              </p>
              {selectedCase && (
                <p className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  Your role: {effectiveCaseRole}{appRole === "admin" ? " (via system admin)" : ""}
                </p>
              )}
              {selectedCase?.description && (
                <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-600">{selectedCase.description}</p>
              )}
              {selectedCase?.source_file_name && (
                <p className="mt-2 break-all text-sm text-slate-500">วิดีโอ: {selectedCase.source_file_name}</p>
              )}
            </div>
            {selectedCase && !showTrash && (
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                {(appRole === "admin" || selectedCase.created_by === currentUserId) && (
                  <>
                    <button type="button" className="btn-secondary" disabled={changingTrash} onClick={() => setEditingCase(selectedCase)}>แก้ไขเคส</button>
                    <button type="button" className="btn-danger" disabled={changingTrash} onClick={() => setCaseToTrash(selectedCase)}>ย้ายเข้าถังขยะ</button>
                  </>
                )}
                <Link
                  to={`/video-cases/${selectedCase.id}`}
                  className="btn-secondary text-center"
                >
                  View details
                </Link>
                <Link
                  to={`/form-submit?caseId=${selectedCase.id}`}
                  className="btn-primary text-center"
                >
                  Submit review
                </Link>
              </div>
            )}
            {selectedCase && showTrash && (appRole === "admin" || selectedCase.created_by === currentUserId) && (
              <button type="button" className="btn-primary" disabled={changingTrash} onClick={() => void handleTrashChange(selectedCase, false)}>{changingTrash ? "กำลังกู้คืน..." : "กู้คืนเคส"}</button>
            )}
          </div>
          <div className="grid border-t border-slate-200 sm:grid-cols-3">
            <div className="border-b border-slate-200 p-4 sm:border-b-0 sm:border-r">
              <p className="text-xs font-medium text-slate-500">Reviews</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{analyses.length}</p>
            </div>
            <div className="border-b border-slate-200 p-4 sm:border-b-0 sm:border-r">
              <p className="text-xs font-medium text-slate-500">Reviewers</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {new Set(analyses.map((analysis) => analysis.user_id).filter(Boolean)).size}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs font-medium text-slate-500">Latest AI summary</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {aggregates[0]?.status || "Not available"}
              </p>
              {selectedCase && !showTrash && aggregates[0]?.document_status === "ready" && (aggregates[0].pdf_storage_path || aggregates[0].docx_storage_path) && (
                <Link
                  to={buildVideoCaseSummaryDocumentPreviewPath(selectedCase.id, aggregates[0].id)}
                  className="btn-primary mt-2 inline-flex text-xs"
                >
                  เปิดไฟล์รวม PDF / DOCX
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{showTrash ? "เคสในถังขยะ" : "Video cases"}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {showTrash ? "เลือกเคสที่ต้องการกู้คืน" : "เลือกเคสเพื่อดูผลประเมิน แก้ไขข้อมูล หรือย้ายเข้าถังขยะ"}
              </p>
            </div>
            <p className="text-xs font-medium text-slate-500">{cases.length} case(s)</p>
          </div>

          {loading ? <p className="mt-4 text-sm text-slate-500" role="status">กำลังโหลดเคส...</p> : cases.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">{showTrash ? "ไม่มีเคสในถังขยะ" : "ยังไม่มีเคสที่ใช้งาน"}</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 font-medium text-slate-500">Case key</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Case title</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Source file</th>
                      <th className="px-4 py-3 font-medium text-slate-500">{showTrash ? "ย้ายเข้าถังขยะเมื่อ" : "Updated"}</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {cases.map((videoCase) => {
                      const isSelected = videoCase.id === selectedCaseId;
                      return (
                        <tr
                          key={videoCase.id}
                          className={isSelected ? "bg-blue-50" : "hover:bg-slate-50"}
                        >
                          <td className="px-4 py-4 align-top">
                            <button
                              type="button"
                              onClick={() => setSelectedCaseId(videoCase.id)}
                              className="text-left"
                            >
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#04418b]">
                                {videoCase.case_key}
                              </p>
                            </button>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <button
                              type="button"
                              onClick={() => setSelectedCaseId(videoCase.id)}
                              className="text-left font-semibold text-slate-900 hover:text-[#04418b]"
                            >
                              {videoCase.case_title || "Untitled case"}
                            </button>
                          </td>
                          <td className="px-4 py-4 align-top text-slate-600">
                            {videoCase.source_file_name || "No source file"}
                          </td>
                          <td className="px-4 py-4 align-top text-slate-600">
                            {new Date((showTrash && videoCase.deleted_at) || videoCase.updated_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-4 align-top">
                            <button
                              type="button"
                              onClick={() => setSelectedCaseId(videoCase.id)}
                              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                isSelected
                                  ? "border-[#04418b] bg-[#04418b] text-white"
                                  : "border-slate-300 bg-white text-slate-700 hover:border-[#04418b] hover:text-[#04418b]"
                              }`}
                            >
                              {isSelected ? "Selected" : "Select"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
