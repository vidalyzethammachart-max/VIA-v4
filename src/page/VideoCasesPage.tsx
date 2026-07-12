import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import ConfirmModal from "../components/ConfirmModal";
import MainNavbar from "../components/MainNavbar";
import { getSections } from "../config/sections";
import { useLanguage } from "../i18n/useLanguage";
import { normalizeRole, type AppRole } from "../lib/roles";
import { supabase } from "../lib/supabaseClient";
import {
  combineVideoCaseAnalyses,
  deleteVideoCaseAggregate,
  deleteVideoCaseEvaluation,
  getMyVideoCases,
  getVideoCaseAggregateDocumentUrls,
  getVideoCaseAggregates,
  getVideoCaseAnalyses,
  getVideoCaseMembership,
  resolveVideoCaseMembership,
  type VideoCaseAggregateRow,
  type VideoCaseEvaluationRow,
  type VideoCaseMemberRole,
  type VideoCaseRow,
} from "../services/videoCaseService";

function getSectionScore(rubric: Record<string, unknown>, sectionId: string): number | null {
  const section = rubric[sectionId];
  if (!section || typeof section !== "object" || Array.isArray(section)) {
    return null;
  }

  const scores = Object.values(section).filter(
    (value): value is number => typeof value === "number" && value >= 1 && value <= 5,
  );
  if (scores.length === 0) {
    return null;
  }

  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

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

export default function VideoCasesPage() {
  const { language } = useLanguage();
  const rubricSections = useMemo(() => getSections(language), [language]);
  const [loading, setLoading] = useState(true);
  const [appRole, setAppRole] = useState<AppRole>("user");
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
  const [aggregateToDelete, setAggregateToDelete] = useState<VideoCaseAggregateRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openingAggregateId, setOpeningAggregateId] = useState<string | null>(null);

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
    try {
      setLoading(true);
      setErrorMessage(null);
      const data = await getMyVideoCases();
      setCases(data);
      if (!selectedCaseId && data[0]?.id) {
        setSelectedCaseId(data[0].id);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load video cases.");
    } finally {
      setLoading(false);
    }
  }, [selectedCaseId]);

  const loadCaseData = useCallback(async (videoCaseId: string) => {
    try {
      const [membership, analysisRows, aggregateRows] = await Promise.all([
        getVideoCaseMembership(videoCaseId),
        getVideoCaseAnalyses(videoCaseId),
        getVideoCaseAggregates(videoCaseId),
      ]);

      setSelectedRole(membership?.member_role ?? null);
      setAnalyses(analysisRows);
      setAggregates(aggregateRows);
      setSelectedAnalysisIds(analysisRows.map((run) => run.id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load case details.");
    }
  }, []);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;

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
  }, [loadCases]);

  useEffect(() => {
    if (!selectedCaseId && cases[0]?.id) {
      setSelectedCaseId(cases[0].id);
    }
  }, [cases, selectedCaseId]);

  useEffect(() => {
    if (!selectedCaseId) {
      setAnalyses([]);
      setAggregates([]);
      setSelectedRole(null);
      setSelectedAnalysisIds([]);
      return;
    }

    void loadCaseData(selectedCaseId);
  }, [loadCaseData, selectedCaseId]);

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
      await combineVideoCaseAnalyses({
        videoCaseId: selectedCase.id,
        caseTitle: selectedCase.case_title || selectedCase.case_key,
        sourceRuns: selectedAnalyses.map((run) => ({
          id: run.id,
          user_id: run.user_id,
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

      setSuccessMessage("Aggregate analysis saved.");
      await loadCaseData(selectedCase.id);
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

  async function handleDeleteAggregate() {
    if (!selectedCase || !aggregateToDelete) return;

    try {
      setDeleting(true);
      setErrorMessage(null);
      await deleteVideoCaseAggregate(aggregateToDelete.id);
      setSuccessMessage("Aggregate analysis was deleted.");
      await loadCaseData(selectedCase.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete aggregate analysis.");
    } finally {
      setDeleting(false);
      setAggregateToDelete(null);
    }
  }

  async function handleOpenAggregateDocument(aggregate: VideoCaseAggregateRow, format: "pdf" | "docx") {
    try {
      setOpeningAggregateId(aggregate.id);
      const urls = await getVideoCaseAggregateDocumentUrls(aggregate.id);
      const url = format === "pdf" ? urls.pdfUrl : urls.docxUrl;
      if (!url) throw new Error(`${format.toUpperCase()} document is not available.`);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to open aggregate document.");
    } finally {
      setOpeningAggregateId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
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
      <ConfirmModal
        isOpen={Boolean(aggregateToDelete)}
        title="Delete aggregate analysis"
        message="Delete this combined AI analysis? This cannot be undone."
        variant="danger"
        onCancel={() => {
          if (!deleting) setAggregateToDelete(null);
        }}
        onConfirm={() => void handleDeleteAggregate()}
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
            </div>
            {selectedCase && (
              <Link to={`/form-submit?caseId=${selectedCase.id}`} className="btn-primary shrink-0 text-center">
                Submit review
              </Link>
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
            </div>
          </div>
        </section>

        <section className="grid gap-6">
          <div className="order-2 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">สร้างหรือเข้าร่วมเคส</h3>
              <p className="mt-1 text-sm text-slate-500">
                กรอกข้อมูลเคสเพื่อผูกผู้ประเมินหลายคนเข้ากับวิดีโอเดียวกัน
              </p>
              <div className="mt-5 grid gap-4">
                <div className="max-w-xs space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    รหัสเคส <span className="text-red-500">*</span>
                  </label>
                <input
                  value={caseKey}
                  onChange={(event) => setCaseKey(event.target.value)}
                  placeholder="รหัสเคส เช่น 001-Test"
                  aria-invalid={isCaseKeyInvalid}
                  className={`h-9 w-full rounded-lg bg-white px-3 text-sm text-slate-900 outline-none transition focus:ring-2 ${
                    isCaseKeyInvalid
                      ? "border border-red-400 focus:border-red-400 focus:ring-red-100"
                      : "border border-slate-200 focus:border-[#04418b] focus:ring-[#04418b]/15"
                  }`}
                />
                {isCaseKeyInvalid && <p className="text-xs text-red-500">Required</p>}
                </div>
                <div className="max-w-xs space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    ชื่อเคส <span className="text-red-500">*</span>
                  </label>
                <input
                  value={caseTitle}
                  onChange={(event) => setCaseTitle(event.target.value)}
                  placeholder="ชื่อเคส"
                  aria-invalid={isCaseTitleInvalid}
                  className={`h-9 w-full rounded-lg bg-white px-3 text-sm text-slate-900 outline-none transition focus:ring-2 ${
                    isCaseTitleInvalid
                      ? "border border-red-400 focus:border-red-400 focus:ring-red-100"
                      : "border border-slate-200 focus:border-[#04418b] focus:ring-[#04418b]/15"
                  }`}
                />
                {isCaseTitleInvalid && <p className="text-xs text-red-500">Required</p>}
                </div>
                <button
                  type="button"
                  onClick={() => void handleResolveCase()}
                  disabled={creating}
                  className="btn-primary w-fit"
                >
                  {creating ? "กำลังบันทึก..." : "บันทึกการเข้าร่วมเคส"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">เคสของฉัน</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    แสดงรายการเคสที่คุณเป็นสมาชิกอยู่
                  </p>
                </div>
                <button type="button" onClick={() => void loadCases()} className="btn-secondary">
                  รีเฟรช
                </button>
              </div>

              {loading ? (
                <div className="py-10 text-center text-sm text-slate-500">กำลังโหลด...</div>
              ) : cases.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  ไม่พบเคส
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {cases.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedCaseId(item.id)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                        item.id === selectedCaseId
                          ? "border-[#04418b] bg-[#04418b]/5"
                          : "border-slate-200 bg-white hover:border-[#04418b]/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{item.case_title || item.case_key}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Key: {item.case_key} · Source: {item.source_file_name || "-"}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                          เปิดดู
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="order-1 space-y-6">
            <div className="hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {selectedCase?.case_title || selectedCase?.case_key || "Select a case"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedCase
                      ? `รหัสเคส: ${selectedCase.case_key}`
                      : "เลือกเคสเพื่อดูผลวิเคราะห์และผลรวม"}
                  </p>
                  {selectedRole && (
                    <p className="mt-2 text-xs text-slate-500">
                      บทบาทของคุณในเคสนี้: {selectedRole}
                    </p>
                  )}
                </div>
                {selectedCase && (
                  <Link
                    to={`/form-submit?caseId=${selectedCase.id}`}
                    className="btn-primary text-center"
                  >
                    ส่งการประเมิน
                  </Link>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">ผลวิเคราะห์รายคน</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    แสดงผลที่ผู้ประเมินแต่ละคนส่งเข้ามาในเคสนี้
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {canCombine && analyses.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedAnalysisIds(analyses.map((run) => run.id))}
                        className="btn-secondary text-xs"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedAnalysisIds([])}
                        className="btn-secondary text-xs"
                      >
                        Clear
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    disabled={!canCombine || combining || !selectedCase || selectedAnalyses.length === 0}
                    className="btn-primary"
                  >
                    {combining ? "กำลังรวมผล..." : `รวม ${selectedAnalyses.length} รายการและวิเคราะห์ใหม่`}
                  </button>
                </div>
              </div>

              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="คำสั่งเพิ่มเติมสำหรับการสรุปรวม (ไม่บังคับ)"
                rows={3}
                className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#04418b]/30 focus:ring-4 focus:ring-[#04418b]/5"
              />

              {analyses.length > 0 && (
                <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-[1380px] w-full border-collapse text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="sticky left-0 z-10 min-w-48 border-b border-slate-200 bg-slate-50 px-4 py-3 font-semibold">Evaluation</th>
                        {rubricSections.map((section) => (
                          <th key={section.id} className="min-w-28 border-b border-l border-slate-200 px-3 py-3 text-center font-semibold">
                            <span className="block text-[#04418b]">{section.id}</span>
                            <span className="mt-1 block font-normal leading-4">{section.title}</span>
                          </th>
                        ))}
                        <th className="min-w-20 border-b border-l border-slate-200 px-3 py-3 text-center font-semibold">Average</th>
                        <th className="min-w-72 border-b border-l border-slate-200 px-4 py-3 font-semibold">AI analysis</th>
                        {canCombine && <th className="min-w-28 border-b border-l border-slate-200 px-3 py-3 text-center font-semibold">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {analyses.map((run) => {
                        const sectionScores = rubricSections.map((section) => getSectionScore(run.rubric, section.id));
                        const scoredSections = sectionScores.filter((score): score is number => score !== null);
                        const overallScore = scoredSections.length > 0
                          ? scoredSections.reduce((total, score) => total + score, 0) / scoredSections.length
                          : null;

                        return (
                          <tr key={run.id} className="align-top hover:bg-slate-50/70">
                            <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3">
                              <p className="font-semibold text-slate-900">{run.subject_name || "Untitled"}</p>
                              <p className="mt-1 text-slate-500">Evaluation #{run.id}</p>
                              <p className="mt-1 text-slate-500">Employee no.: {run.employee_number || "-"}</p>
                              <p className="mt-1 text-slate-500">{new Date(run.created_at).toLocaleString()}</p>
                            </td>
                            {sectionScores.map((score, index) => (
                              <td key={rubricSections[index].id} className="border-l border-slate-200 px-3 py-3 text-center font-semibold text-slate-700">
                                {score === null ? "-" : score.toFixed(1)}
                              </td>
                            ))}
                            <td className="border-l border-slate-200 px-3 py-3 text-center font-bold text-[#04418b]">
                              {overallScore === null ? "-" : overallScore.toFixed(1)}
                            </td>
                            <td className="border-l border-slate-200 px-4 py-3 leading-5 text-slate-600">
                              <p className="line-clamp-4 whitespace-pre-wrap">{getAiOutputText(run)}</p>
                            </td>
                            {canCombine && (
                              <td className="border-l border-slate-200 px-3 py-3 text-center">
                                <label className="flex items-center justify-center gap-2 text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={selectedAnalysisIds.includes(run.id)}
                                    onChange={(event) => {
                                      setSelectedAnalysisIds((current) => event.target.checked
                                        ? [...new Set([...current, run.id])]
                                        : current.filter((id) => id !== run.id));
                                    }}
                                  />
                                  Include
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setEvaluationToDelete(run)}
                                  className="mt-2 text-xs font-semibold text-red-600 hover:text-red-800"
                                >
                                  Delete
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {analyses.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">ยังไม่มีผลวิเคราะห์</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {analyses.map((run) => (
                    <article key={run.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {run.subject_name || "Untitled"} · {run.analysis_kind}
                          </p>
                          <p className="text-xs text-slate-500">
                            ผู้ประเมิน: {run.employee_number || "-"} · รหัสประเมิน: {run.id}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500">
                          {new Date(run.created_at).toLocaleString()}
                        </p>
                      </div>
                      <p className="mt-3 line-clamp-3 text-sm text-slate-600">
                        {getAiOutputText(run)}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">ผลรวมของเคส</h3>
              {aggregates.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">ยังไม่มีผลรวม</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {aggregates.map((aggregate) => (
                    <article key={aggregate.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">
                            ผลรวม · {aggregate.status}
                          </p>
                          <p className="text-xs text-slate-500">
                            แหล่งข้อมูล: {aggregate.source_count} · ผู้สั่งรวม: {aggregate.requested_by}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500">
                          {new Date(aggregate.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded-full px-2 py-1 font-semibold ${
                          aggregate.document_status === "ready"
                            ? "bg-emerald-50 text-emerald-700"
                            : aggregate.document_status === "failed"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700"
                        }`}>
                          Document: {aggregate.document_status}
                        </span>
                        {aggregate.document_status === "ready" && aggregate.pdf_storage_path && (
                          <button
                            type="button"
                            onClick={() => void handleOpenAggregateDocument(aggregate, "pdf")}
                            disabled={openingAggregateId === aggregate.id}
                            className="btn-secondary px-3 py-1 text-xs"
                          >
                            Open PDF
                          </button>
                        )}
                        {aggregate.document_status === "ready" && aggregate.docx_storage_path && (
                          <button
                            type="button"
                            onClick={() => void handleOpenAggregateDocument(aggregate, "docx")}
                            disabled={openingAggregateId === aggregate.id}
                            className="btn-secondary px-3 py-1 text-xs"
                          >
                            Open DOCX
                          </button>
                        )}
                        {aggregate.document_status === "failed" && aggregate.document_error && (
                          <span className="text-red-600">{aggregate.document_error}</span>
                        )}
                      </div>
                      {canCombine && (
                        <button
                          type="button"
                          onClick={() => setAggregateToDelete(aggregate)}
                          className="text-xs font-semibold text-red-600 hover:text-red-800"
                        >
                          Delete aggregate
                        </button>
                      )}
                      <div className="mt-3 rounded-xl bg-slate-50 p-4">
                        <p className="text-sm font-medium text-slate-800">AI summary</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {getAiSummary(aggregate.ai_output, aggregate.ai_raw_text)}
                        </p>
                        <p className="mt-3 text-xs text-slate-500">
                          Model: {aggregate.ai_model || "-"} · Combined from {aggregate.source_count} evaluation(s)
                        </p>
                      </div>
                      <details className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-600">View technical details</summary>
                        <pre className="mt-3 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
{JSON.stringify(
  {
    combined_scores: aggregate.combined_scores,
    ai_model: aggregate.ai_model,
    ai_output: aggregate.ai_output,
    ai_raw_text: aggregate.ai_raw_text,
  },
  null,
  2,
)}
                        </pre>
                      </details>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
