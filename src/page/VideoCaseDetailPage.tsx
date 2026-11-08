import { getAnalysisMatrix } from "../services/aggregateStatistics.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import ConfirmModal from "../components/ConfirmModal";
import MainNavbar from "../components/MainNavbar";
import "./dashboard.css";
import VideoCaseEditor from "../components/VideoCaseEditor";
import { buildVideoCaseSummaryDocumentPreviewPath } from "../services/videoCaseSummaryDocumentPreviewCore.js";
import {
  getCombinableEvaluationIds,
  isCombinableEvaluation,
  keepCombinableSelection,
} from "../services/videoCaseCombineSelectionCore.js";
import { normalizeRole, type AppRole } from "../lib/roles";
import { useLanguage } from "../i18n/useLanguage";
import { deleteEvaluationWithFiles } from "../services/evaluationDelete";
import { describeEvaluationDeleteError } from "../utils/evaluationDeleteError";
import { supabase } from "../lib/supabaseClient";
import {
  buildVideoCaseAggregateHistoryItem,
  buildVideoCaseAggregateSummaryPath,
} from "../services/videoCaseAggregateHistoryCore";
import {
  combineVideoCaseAnalyses,
  deleteVideoCaseAggregate,
  getMyVideoCases,
  getVideoCaseAggregates,
  getVideoCaseAnalyses,
  getVideoCaseMembership,
  type VideoCaseAggregateRow,
  type VideoCaseEvaluationRow,
  type VideoCaseMemberRole,
  type VideoCaseRow,
} from "../services/videoCaseService";

const PAGE_SIZE = 15;

function getEvaluationAverage(run: VideoCaseEvaluationRow): number | null {
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

const formatDetailDate = (value: string) => new Date(value).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

function StatusDot({ status }: { status: string }) {
  const state = status === "ready" ? "ready" : status === "failed" ? "alert" : "pending";
  return <span className="db-state" data-state={state}>{getStatusLabel(status)}</span>;
}

function combinedStatus(analysis: string, document: string): string {
  if (analysis === "failed" || document === "failed") return "failed";
  return analysis === "ready" && document === "ready" ? "ready" : "pending";
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "กำลังดำเนินการ",
    ready: "พร้อมเปิด",
    failed: "ไม่สำเร็จ",
  };

  return labels[status] || status;
}

export default function VideoCaseDetailPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { videoCaseId } = useParams<{ videoCaseId: string }>();
  const [loading, setLoading] = useState(true);
  const [appRole, setAppRole] = useState<AppRole>("user");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingCase, setEditingCase] = useState<VideoCaseRow | null>(null);
  const [cases, setCases] = useState<VideoCaseRow[]>([]);
  const [selectedRole, setSelectedRole] = useState<VideoCaseMemberRole | null>(null);
  const [analyses, setAnalyses] = useState<VideoCaseEvaluationRow[]>([]);
  const [aggregates, setAggregates] = useState<VideoCaseAggregateRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [evaluatorNames, setEvaluatorNames] = useState<Record<string, string>>({});
  const [evalSearch, setEvalSearch] = useState("");
  const [evalPage, setEvalPage] = useState(1);
  const [combining, setCombining] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedAnalysisIds, setSelectedAnalysisIds] = useState<number[]>([]);
  const [evaluationToDelete, setEvaluationToDelete] = useState<VideoCaseEvaluationRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [aggregateToDelete, setAggregateToDelete] =
    useState<VideoCaseAggregateRow | null>(null);
  const [deletingAggregate, setDeletingAggregate] = useState(false);

  const selectedCase = useMemo(
    () => cases.find((item) => item.id === videoCaseId) ?? null,
    [cases, videoCaseId],
  );

  const effectiveCaseRole: VideoCaseMemberRole =
    appRole === "admin" ? "leader" : (selectedRole ?? "member");
  const canCombine = effectiveCaseRole === "leader";
  const selectedAnalyses = useMemo(() => {
    const combinableIds = keepCombinableSelection(analyses, selectedAnalysisIds);
    return analyses.filter((run) => combinableIds.includes(run.id));
  }, [analyses, selectedAnalysisIds]);
  const notReadyCount = useMemo(
    () => analyses.filter((run) => !isCombinableEvaluation(run)).length,
    [analyses],
  );
  const evaluatorLabel = (run: VideoCaseEvaluationRow) => (run.user_id && evaluatorNames[run.user_id]) || run.employee_number || "-";
  const evalTerm = evalSearch.trim().toLowerCase();
  const filteredAnalyses = evalTerm
    ? analyses.filter((run) => [String(run.id), run.subject_name, run.employee_number, run.user_id ? evaluatorNames[run.user_id] : "", run.overall_suggestion].some((value) => (value || "").toLowerCase().includes(evalTerm)))
    : analyses;
  const evalPageCount = Math.max(1, Math.ceil(filteredAnalyses.length / PAGE_SIZE));
  const currentEvalPage = Math.min(evalPage, evalPageCount);
  const pageAnalyses = filteredAnalyses.slice((currentEvalPage - 1) * PAGE_SIZE, currentEvalPage * PAGE_SIZE);
  const latestAggregate = aggregates[0] ?? null;
  const groupedEvaluationIds = useMemo(
    () => new Set(aggregates.flatMap((aggregate) => buildVideoCaseAggregateHistoryItem(aggregate).sourceEvaluationIds)),
    [aggregates],
  );
  const aggregateHistory = useMemo(
    () =>
      aggregates.map((aggregate) => ({
        aggregate,
        item: buildVideoCaseAggregateHistoryItem(aggregate),
      })),
    [aggregates],
  );

  const loadCases = useCallback(async () => {
    const data = await getMyVideoCases();
    setCases(data);
  }, []);

  const loadCaseData = useCallback(async (currentVideoCaseId: string) => {
    const [membership, analysisRows, aggregateRows] = await Promise.all([
      getVideoCaseMembership(currentVideoCaseId),
      getVideoCaseAnalyses(currentVideoCaseId),
      getVideoCaseAggregates(currentVideoCaseId),
    ]);

    setSelectedRole(membership?.member_role ?? null);
    setAnalyses(analysisRows);
    setAggregates(aggregateRows);
    setSelectedAnalysisIds([]);
    void supabase.rpc("list_case_evaluators", { p_video_case_id: currentVideoCaseId }).then(({ data, error }) => {
      if (error || !Array.isArray(data)) return;
      const names: Record<string, string> = {};
      for (const row of data as { user_id: string; full_name: string | null }[]) {
        const name = row.full_name?.trim();
        if (name) names[row.user_id] = name;
      }
      setEvaluatorNames(names);
    });
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
    const load = async () => {
      if (!videoCaseId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErrorMessage(null);
        await loadCases();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [loadCases, videoCaseId]);

  useEffect(() => {
    if (!videoCaseId) return;

    void loadCaseData(videoCaseId).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ");
    });
  }, [loadCaseData, videoCaseId]);

  async function handleCombine() {
    if (!selectedCase) {
      setErrorMessage("กรุณาเลือกงานประเมินก่อน");
      return;
    }

    if (selectedAnalyses.length === 0) {
      setErrorMessage("กรุณาเลือกแบบประเมินอย่างน้อย 1 ใบ");
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
          matrix: getAnalysisMatrix(run.analysis_ai_output),
          ai_output: run.analysis_ai_output,
          ai_raw_text: run.analysis_ai_raw_text,
          notes: run.overall_suggestion,
          created_at: run.created_at,
          order_number: run.order_number,
        })),
      });

      navigate(`/video-cases/${selectedCase.id}/summaries/${aggregate.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "รวมเป็นแบบประเมินกลุ่มไม่สำเร็จ");
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
      await deleteEvaluationWithFiles(evaluationToDelete.id);
      setSuccessMessage(`ลบแบบประเมิน ${evaluationToDelete.id} แล้ว`);
      await loadCaseData(selectedCase.id);
    } catch (error) {
      setErrorMessage(describeEvaluationDeleteError(error, t));
    } finally {
      setDeleting(false);
      setEvaluationToDelete(null);
    }
  }

  async function handleDeleteAggregate() {
    if (!selectedCase || !aggregateToDelete) return;

    try {
      setDeletingAggregate(true);
      setErrorMessage(null);
      await deleteVideoCaseAggregate(aggregateToDelete.id);
      setSuccessMessage(
        `ลบแบบประเมินกลุ่ม ${aggregateToDelete.id.slice(0, 8)} แล้ว`,
      );
      await loadCaseData(selectedCase.id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "ลบแบบประเมินกลุ่มไม่สำเร็จ",
      );
    } finally {
      setDeletingAggregate(false);
      setAggregateToDelete(null);
    }
  }

  if (!videoCaseId) {
    return <Navigate to="/video-cases" replace />;
  }

  return (
    <div className="db-root">
      <MainNavbar />
      {editingCase && (
        <VideoCaseEditor key={editingCase.id} videoCase={editingCase}
          onCancel={() => setEditingCase(null)}
          onSaved={(updated) => {
            setCases((previous) => previous.map((item) => item.id === updated.id ? updated : item));
            setEditingCase(null);
            setErrorMessage(null);
            setSuccessMessage("บันทึกข้อมูลงานประเมินเรียบร้อยแล้ว");
          }}
        />
      )}
      <ConfirmModal
        isOpen={confirmOpen}
        title="รวมเป็นแบบประเมินกลุ่ม"
        message={`รวมแบบประเมิน ${selectedAnalyses.map((run) => run.id).join(", ")} (${selectedAnalyses.length} ใบ) เป็นแบบประเมินกลุ่มของงานประเมินนี้`}
        variant="primary"
        onCancel={() => {
          if (!combining) setConfirmOpen(false);
        }}
        onConfirm={() => void handleCombine()}
        confirmLabel="รวม"
        cancelLabel="ยกเลิก"
        confirmDisabled={combining}
      />
      <ConfirmModal
        isOpen={Boolean(evaluationToDelete)}
        title="ลบแบบประเมิน"
        message={`คุณแน่ใจหรือไม่ว่าต้องการลบแบบประเมิน ${evaluationToDelete?.id ?? ""}?`}
        variant="danger"
        onCancel={() => {
          if (!deleting) setEvaluationToDelete(null);
        }}
        onConfirm={() => void handleDeleteEvaluation()}
        confirmLabel={deleting ? "กำลังลบ..." : "ลบ"}
        cancelLabel="ยกเลิก"
        confirmDisabled={deleting}
      />
      <ConfirmModal
        isOpen={Boolean(aggregateToDelete)}
        title="ลบแบบประเมินกลุ่ม"
        message={`คุณแน่ใจหรือไม่ว่าต้องการลบแบบประเมินกลุ่ม ${aggregateToDelete?.id.slice(0, 8) ?? ""}? แบบประเมินรายบุคคลที่นำมารวมจะยังอยู่`}
        variant="danger"
        onCancel={() => {
          if (!deletingAggregate) setAggregateToDelete(null);
        }}
        onConfirm={() => void handleDeleteAggregate()}
        confirmLabel={deletingAggregate ? "กำลังลบ..." : "ลบ"}
        cancelLabel="ยกเลิก"
        confirmDisabled={deletingAggregate}
      />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <Link to="/video-cases" className="db-link text-sm">← กลับไปรายการงานประเมิน</Link>
            <h1 className="mt-2 break-words text-3xl font-bold leading-snug">
              {selectedCase?.case_title || selectedCase?.case_key || "งานประเมิน"}
            </h1>
            <p className="db-muted">
              {selectedCase ? `รหัส ${selectedCase.case_key}` : "ไม่พบงานประเมิน"}
            </p>
          </div>
          {selectedCase && (
            <Link to={`/form-submit?caseId=${selectedCase.id}`} className="btn-primary text-center">กรอกแบบประเมิน</Link>
          )}
        </header>

        {errorMessage && <div role="alert" className="db-alert mb-4">{errorMessage}</div>}
        {successMessage && <div role="status" className="db-ok mb-4">{successMessage}</div>}

        {loading ? (
          <p className="db-muted py-10 text-center text-sm" role="status">กำลังโหลด...</p>
        ) : !selectedCase ? (
          <div role="alert" className="db-alert py-10 text-center">ไม่พบงานประเมินนี้ หรือคุณไม่มีสิทธิ์เข้าถึง</div>
        ) : (
          <div className="space-y-8">
            <section className="db-panel overflow-hidden">
              <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between md:p-6">
                <div className="min-w-0">
                  <p className="db-state" data-state={effectiveCaseRole === "leader" ? "ready" : "pending"}>
                    คุณเป็น{effectiveCaseRole === "leader" ? "หัวหน้า" : "สมาชิก"}{appRole === "admin" ? " (ผู้ดูแลระบบ)" : ""}
                  </p>
                  {selectedCase.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm">{selectedCase.description}</p>}
                  <p className="db-muted mt-2 break-all text-sm">
                    {selectedCase.source_file_name ? `วิดีโอ: ${selectedCase.source_file_name}` : "ไม่มีไฟล์วิดีโอ"} · แก้ไขล่าสุด {formatDetailDate(selectedCase.updated_at)}
                  </p>
                </div>
                {(appRole === "admin" || selectedCase.created_by === currentUserId) && (
                  <button type="button" className="btn-secondary shrink-0" onClick={() => setEditingCase(selectedCase)}>แก้ไข</button>
                )}
              </div>
              <dl className="db-kpis" style={{ gridTemplateColumns: "repeat(3, 1fr)", borderBottom: 0 }}>
                <div className="db-kpi" style={{ borderLeft: 0 }}>
                  <dt className="db-muted text-sm">แบบประเมิน</dt>
                  <dd>{analyses.length}</dd>
                </div>
                <div className="db-kpi" style={{ borderLeft: "1px solid var(--db-line)" }}>
                  <dt className="db-muted text-sm">ผู้ประเมิน</dt>
                  <dd>{new Set(analyses.map((analysis) => analysis.user_id).filter(Boolean)).size}</dd>
                </div>
                <div className="db-kpi" style={{ borderLeft: "1px solid var(--db-line)" }}>
                  <dt className="db-muted text-sm">แบบประเมินกลุ่มล่าสุด</dt>
                  <dd className="!text-base !font-semibold">{latestAggregate ? getStatusLabel(latestAggregate.status) : "ยังไม่มี"}</dd>
                </div>
              </dl>
            </section>

            <section className="db-panel p-4 sm:p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-xl font-bold leading-snug">รายการแบบประเมิน</h2>
                  <p className="db-muted mt-1 text-sm">
                    ตรวจแต่ละแบบประเมิน แล้วเลือกที่ต้องการรวมเป็นแบบประเมินกลุ่ม
                  </p>
                  {canCombine && notReadyCount > 0 && (
                    <p className="db-state mt-2" data-state="pending">
                      เลือกรวมได้เฉพาะแบบประเมินที่พร้อมเปิด ({notReadyCount} ใบยังไม่พร้อม)
                    </p>
                  )}
                </div>
                {canCombine && analyses.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setSelectedAnalysisIds(getCombinableEvaluationIds(analyses))} className="btn-secondary text-xs">
                      เลือกทั้งหมด
                    </button>
                    <button type="button" onClick={() => setSelectedAnalysisIds([])} className="btn-secondary text-xs">
                      ล้างการเลือก
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(true)}
                      disabled={combining || selectedAnalyses.length === 0}
                      className="btn-primary text-xs"
                    >
                      {combining ? "กำลังรวม..." : `รวมเป็นแบบประเมินกลุ่ม (${selectedAnalyses.length})`}
                    </button>
                  </div>
                )}
              </div>

              {analyses.length === 0 ? (
                <p className="db-muted mt-4 text-sm">ยังไม่มีแบบประเมินในงานประเมินนี้</p>
              ) : (
                <>
                  <div className="mt-4">
                    <label htmlFor="evaluation-search" className="sr-only">ค้นหาแบบประเมิน</label>
                    <input
                      id="evaluation-search"
                      type="search"
                      value={evalSearch}
                      onChange={(event) => { setEvalSearch(event.target.value); setEvalPage(1); }}
                      placeholder="ค้นหาจาก ID หัวข้อ ชื่อผู้ประเมิน หรือข้อเสนอแนะ"
                      className="db-input w-full sm:max-w-sm"
                    />
                  </div>
                  {filteredAnalyses.length === 0 && <p className="db-muted mt-4 text-sm">ไม่พบแบบประเมินที่ตรงกับ “{evalSearch.trim()}”</p>}
                  <ul className="mt-4 md:hidden">
                    {pageAnalyses.map((run) => {
                      const overallScore = getEvaluationAverage(run);
                      const combinable = isCombinableEvaluation(run);
                      return (
                        <li key={run.id} className="space-y-2 border-t py-4 text-sm" style={{ borderColor: "var(--db-line)" }}>
                          <div className="flex items-start gap-3">
                            {canCombine && (
                              <input
                                type="checkbox"
                                checked={combinable && selectedAnalysisIds.includes(run.id)}
                                disabled={!combinable}
                                onChange={(event) => {
                                  setSelectedAnalysisIds((current) =>
                                    event.target.checked
                                      ? [...new Set([...current, run.id])]
                                      : current.filter((id) => id !== run.id),
                                  );
                                }}
                                aria-label={`เลือกแบบประเมิน ${run.id} เพื่อรวมเป็นแบบประเมินกลุ่ม`}
                                className="mt-1 h-5 w-5 shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <Link to={`/preview/${run.id}`} className="db-link break-words">{run.subject_name || "ไม่มีชื่อหัวข้อ"}</Link>
                              <p className="db-muted mt-1 text-xs">
                                {run.id} · {evaluatorLabel(run)} · {formatDetailDate(run.created_at)}
                              </p>
                              {groupedEvaluationIds.has(run.id) && <span className="db-chip mt-1 inline-block">อยู่ในแบบประเมินกลุ่มแล้ว</span>}
                            </div>
                            <span className="shrink-0 text-lg font-bold tabular-nums">{overallScore === null ? "—" : overallScore.toFixed(1)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <StatusDot status={run.document_status} />
                            {canCombine && (groupedEvaluationIds.has(run.id)
                              ? <span className="db-muted text-xs">ลบแบบประเมินกลุ่มก่อนจึงจะลบได้</span>
                              : <button type="button" onClick={() => setEvaluationToDelete(run)} className="db-danger-link">ลบ</button>)}
                          </div>
                          {run.overall_suggestion?.trim() && (
                            <p className="db-muted line-clamp-3 whitespace-pre-wrap text-xs leading-5">{run.overall_suggestion.trim()}</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-4 hidden overflow-x-auto md:block">
                    <table className="db-table w-full min-w-[860px] text-left text-sm">
                      <thead>
                        <tr>
                          {canCombine && <th className="w-10 px-3 py-3"><span className="sr-only">เลือก</span></th>}
                          <th className="px-3 py-3">ID</th>
                          <th className="px-3 py-3">หัวข้อ</th>
                          <th className="px-3 py-3">ผู้ประเมิน</th>
                          <th className="px-3 py-3">คะแนนเฉลี่ย</th>
                          <th className="px-3 py-3">สถานะ</th>
                          <th className="px-3 py-3">ข้อเสนอแนะโดยรวม</th>
                          {canCombine && <th className="px-3 py-3"><span className="sr-only">ลบ</span></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {pageAnalyses.map((run) => {
                          const overallScore = getEvaluationAverage(run);
                          const combinable = isCombinableEvaluation(run);
                          return (
                            <tr key={run.id} className="align-top">
                              {canCombine && (
                                <td className="px-3 py-3">
                                  <input
                                    type="checkbox"
                                    checked={combinable && selectedAnalysisIds.includes(run.id)}
                                    disabled={!combinable}
                                    title={combinable ? undefined : "แบบประเมินนี้ยังไม่พร้อม จึงนำมารวมไม่ได้"}
                                    onChange={(event) => {
                                      setSelectedAnalysisIds((current) =>
                                        event.target.checked
                                          ? [...new Set([...current, run.id])]
                                          : current.filter((id) => id !== run.id),
                                      );
                                    }}
                                    aria-label={`เลือกแบบประเมิน ${run.id} เพื่อรวมเป็นแบบประเมินกลุ่ม`}
                                    className="h-5 w-5 disabled:cursor-not-allowed disabled:opacity-40"
                                  />
                                </td>
                              )}
                              <td className="px-3 py-3 font-semibold tabular-nums">
                                <Link to={`/preview/${run.id}`} className="db-link">{run.id}</Link>
                              </td>
                              <td className="px-3 py-3">
                                <Link to={`/preview/${run.id}`} className="db-link">{run.subject_name || "ไม่มีชื่อหัวข้อ"}</Link>
                                <p className="db-muted mt-1 text-xs">{formatDetailDate(run.created_at)}</p>
                                {groupedEvaluationIds.has(run.id) && <span className="db-chip mt-1 inline-block">อยู่ในแบบประเมินกลุ่มแล้ว</span>}
                              </td>
                              <td className="px-3 py-3">
                                <p>{evaluatorLabel(run)}</p>
                                {run.user_id && evaluatorNames[run.user_id] && run.employee_number && <p className="db-muted mt-1 text-xs">{run.employee_number}</p>}
                              </td>
                              <td className="px-3 py-3 font-semibold tabular-nums">{overallScore === null ? "—" : overallScore.toFixed(1)}</td>
                              <td className="px-3 py-3"><StatusDot status={run.document_status} /></td>
                              <td className="db-muted max-w-xs px-3 py-3 leading-5">
                                <p className="line-clamp-3 whitespace-pre-wrap">{run.overall_suggestion?.trim() || "-"}</p>
                              </td>
                              {canCombine && (
                                <td className="px-3 py-3 text-right">
                                  {groupedEvaluationIds.has(run.id)
                                    ? <span className="db-muted text-xs" title="ลบแบบประเมินกลุ่มที่ใช้แบบประเมินนี้ก่อน จึงจะลบได้">ลบไม่ได้</span>
                                    : <button type="button" onClick={() => setEvaluationToDelete(run)} className="db-danger-link">ลบ</button>}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {evalPageCount > 1 && (
                    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="เลือกหน้า">
                      <span className="db-muted text-xs tabular-nums">
                        {`แสดง ${(currentEvalPage - 1) * PAGE_SIZE + 1}–${Math.min(currentEvalPage * PAGE_SIZE, filteredAnalyses.length)} จาก ${filteredAnalyses.length} ใบ`}
                      </span>
                      <div className="flex items-center gap-2">
                        <button type="button" className="btn-secondary text-xs" disabled={currentEvalPage <= 1} onClick={() => setEvalPage(currentEvalPage - 1)}>ก่อนหน้า</button>
                        <span className="db-muted text-xs tabular-nums" aria-live="polite">{`หน้า ${currentEvalPage} จาก ${evalPageCount}`}</span>
                        <button type="button" className="btn-secondary text-xs" disabled={currentEvalPage >= evalPageCount} onClick={() => setEvalPage(currentEvalPage + 1)}>ถัดไป</button>
                      </div>
                    </nav>
                  )}
                </>
              )}
            </section>

            <section className="db-panel p-4 sm:p-6">
              <div>
                <h2 className="text-xl font-bold leading-snug">ประวัติแบบประเมินกลุ่ม</h2>
                <p className="db-muted mt-1 text-sm">แบบประเมินกลุ่มที่รวมจากแบบประเมินในงานประเมินนี้</p>
              </div>

              {aggregateHistory.length === 0 ? (
                <p className="db-muted mt-4 text-sm">ยังไม่มีแบบประเมินกลุ่มในงานประเมินนี้</p>
              ) : (
                <>
                <ul className="mt-4 md:hidden">
                  {aggregateHistory.map(({ aggregate, item }) => (
                    <li key={item.aggregateId} className="space-y-2 border-t py-4 text-sm" style={{ borderColor: "var(--db-line)" }}>
                      <Link to={buildVideoCaseAggregateSummaryPath(selectedCase.id, item.aggregateId)} className="db-link break-words">{item.fileName}</Link>
                      <p className="db-muted text-xs">
                        {item.createdAt ? formatDetailDate(item.createdAt) : "-"} · {item.creatorName} · {item.sourceCount} ใบ ({item.sourceEvaluationIds.length ? item.sourceEvaluationIds.join(", ") : "-"})
                      </p>
                      <StatusDot status={combinedStatus(item.analysisStatus, item.documentStatus)} />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {aggregate.document_status === "ready" && (aggregate.pdf_storage_path || aggregate.docx_storage_path) ? (
                          <Link to={buildVideoCaseSummaryDocumentPreviewPath(selectedCase.id, item.aggregateId)} className="btn-secondary text-xs">เปิดไฟล์ PDF / DOCX</Link>
                        ) : <span />}
                        {canCombine && (
                          <button type="button" onClick={() => setAggregateToDelete(aggregate)} className="db-danger-link">ลบ</button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 hidden overflow-x-auto md:block">
                  <table className="db-table w-full min-w-[900px] text-left text-sm">
                    <thead>
                      <tr>
                        {["ชื่อไฟล์", "วันที่สร้าง", "ผู้รวม", "แบบประเมินที่ใช้", "สถานะ", ""].map((label, index) => (
                          <th key={index} className="px-3 py-3">{label || <span className="sr-only">จัดการ</span>}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {aggregateHistory.map(({ aggregate, item }) => (
                        <tr key={item.aggregateId} className="align-top">
                          <td className="px-3 py-3">
                            <Link to={buildVideoCaseAggregateSummaryPath(selectedCase.id, item.aggregateId)} className="db-link break-words">{item.fileName}</Link>
                            {aggregate.document_status === "ready" && (aggregate.pdf_storage_path || aggregate.docx_storage_path) && (
                              <Link
                                to={buildVideoCaseSummaryDocumentPreviewPath(selectedCase.id, item.aggregateId)}
                                className="btn-secondary mt-2 inline-flex text-xs"
                              >
                                เปิดไฟล์ PDF / DOCX
                              </Link>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">{item.createdAt ? formatDetailDate(item.createdAt) : "-"}</td>
                          <td className="px-3 py-3">
                            <p>{item.creatorName}</p>
                            <p className="db-muted mt-1 text-xs">{item.employeeNumber}</p>
                          </td>
                          <td className="px-3 py-3">
                            <p>{item.sourceCount} ใบ</p>
                            <p className="db-muted mt-1 text-xs">
                              {item.sourceEvaluationIds.length ? item.sourceEvaluationIds.join(", ") : "-"}
                            </p>
                          </td>
                          <td className="px-3 py-3"><StatusDot status={combinedStatus(item.analysisStatus, item.documentStatus)} /></td>
                          <td className="px-3 py-3 text-right">
                            {canCombine && (
                              <button type="button" onClick={() => setAggregateToDelete(aggregate)} className="db-danger-link">ลบ</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
