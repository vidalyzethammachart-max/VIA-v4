import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import ConfirmModal from "../components/ConfirmModal";
import MainNavbar from "../components/MainNavbar";
import { normalizeRole, type AppRole } from "../lib/roles";
import { supabase } from "../lib/supabaseClient";
import {
  buildVideoCaseAggregateHistoryItem,
  buildVideoCaseAggregateSummaryPath,
} from "../services/videoCaseAggregateHistoryCore";
import {
  combineVideoCaseAnalyses,
  deleteVideoCaseAggregate,
  deleteVideoCaseEvaluation,
  getMyVideoCases,
  getVideoCaseAggregates,
  getVideoCaseAnalyses,
  getVideoCaseMembership,
  type VideoCaseAggregateRow,
  type VideoCaseEvaluationRow,
  type VideoCaseMemberRole,
  type VideoCaseRow,
} from "../services/videoCaseService";

function getAiSummary(output: unknown, rawText: string | null): string {
  if (typeof output === "string" && output.trim()) return output;
  if (!output || typeof output !== "object") return rawText || "No AI analysis available.";

  const record = output as Record<string, unknown>;
  for (const key of ["summary", "overall_summary", "overallSummary", "report", "feedback"]) {
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

  if (scores.length === 0) return null;

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export default function VideoCaseDetailPage() {
  const navigate = useNavigate();
  const { videoCaseId } = useParams<{ videoCaseId: string }>();
  const [loading, setLoading] = useState(true);
  const [appRole, setAppRole] = useState<AppRole>("user");
  const [cases, setCases] = useState<VideoCaseRow[]>([]);
  const [selectedRole, setSelectedRole] = useState<VideoCaseMemberRole | null>(null);
  const [analyses, setAnalyses] = useState<VideoCaseEvaluationRow[]>([]);
  const [aggregates, setAggregates] = useState<VideoCaseAggregateRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
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
  const selectedAnalyses = useMemo(
    () => analyses.filter((run) => selectedAnalysisIds.includes(run.id)),
    [analyses, selectedAnalysisIds],
  );
  const latestAggregate = aggregates[0] ?? null;
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
    setSelectedAnalysisIds(analysisRows.map((run) => run.id));
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
        setErrorMessage(error instanceof Error ? error.message : "Failed to load video case.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [loadCases, videoCaseId]);

  useEffect(() => {
    if (!videoCaseId) return;

    void loadCaseData(videoCaseId).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load case details.");
    });
  }, [loadCaseData, videoCaseId]);

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

  async function handleDeleteAggregate() {
    if (!selectedCase || !aggregateToDelete) return;

    try {
      setDeletingAggregate(true);
      setErrorMessage(null);
      await deleteVideoCaseAggregate(aggregateToDelete.id);
      setSuccessMessage(
        `Aggregate ${aggregateToDelete.id.slice(0, 8)} was deleted.`,
      );
      await loadCaseData(selectedCase.id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to delete aggregate.",
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
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
      <ConfirmModal
        isOpen={confirmOpen}
        title="รวมผลแบบประเมิน"
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
        title="Delete aggregate"
        message={`Delete aggregate ${aggregateToDelete?.id.slice(0, 8) ?? ""}? Source evaluations will remain.`}
        variant="danger"
        onCancel={() => {
          if (!deletingAggregate) setAggregateToDelete(null);
        }}
        onConfirm={() => void handleDeleteAggregate()}
        confirmLabel={deletingAggregate ? "Deleting..." : "Delete"}
        cancelLabel="Cancel"
        confirmDisabled={deletingAggregate}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 md:py-8">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#04418b]">Video case details</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              {selectedCase?.case_title || selectedCase?.case_key || "Video case"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {selectedCase ? `Case key: ${selectedCase.case_key}` : "Choose a case from the list."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/video-cases" className="btn-secondary">
              Back to cases
            </Link>
            {selectedCase && (
              <Link to={`/form-submit?caseId=${selectedCase.id}`} className="btn-primary">
                Submit review
              </Link>
            )}
          </div>
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

        {loading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            Loading case details...
          </section>
        ) : !selectedCase ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700 shadow-sm">
            Video case not found.
          </section>
        ) : (
          <div className="space-y-6">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-5 p-5 md:flex-row md:items-start md:justify-between md:p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#04418b]">Current video case</p>
                  <h2 className="mt-2 text-2xl font-bold text-slate-900">{selectedCase.case_title || selectedCase.case_key}</h2>
                  <p className="mt-2 text-sm text-slate-500">Case key: {selectedCase.case_key}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedCase.source_file_name || "No source file"} · Updated {new Date(selectedCase.updated_at).toLocaleString()}
                  </p>
                </div>
                <p className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  Your role: {effectiveCaseRole}{appRole === "admin" ? " (via system admin)" : ""}
                </p>
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
                    {latestAggregate ? latestAggregate.status : "Not available"}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Evaluations</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Review each submission before combining them into a new summary.
                  </p>
                </div>
                {canCombine && analyses.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
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
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(true)}
                      disabled={combining || selectedAnalyses.length === 0}
                      className="btn-primary text-xs"
                    >
                      {combining ? "กำลังรวมผลแบบประเมิน..." : `รวม ${selectedAnalyses.length} รายการและวิเคราะห์ใหม่`}
                    </button>
                  </div>
                )}
              </div>

              {analyses.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">ยังไม่มีผลวิเคราะห์</p>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-[1200px] w-full border-collapse text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="sticky left-0 z-10 min-w-48 border-b border-slate-200 bg-slate-50 px-4 py-3 font-semibold">Evaluation</th>
                        <th className="min-w-28 border-b border-l border-slate-200 px-3 py-3 text-center font-semibold">Employee no.</th>
                        <th className="min-w-20 border-b border-l border-slate-200 px-3 py-3 text-center font-semibold">Average</th>
                        <th className="min-w-80 border-b border-l border-slate-200 px-4 py-3 font-semibold">Overall suggestion</th>
                        <th className="min-w-72 border-b border-l border-slate-200 px-4 py-3 font-semibold">AI analysis</th>
                        {canCombine && <th className="min-w-28 border-b border-l border-slate-200 px-3 py-3 text-center font-semibold">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {analyses.map((run) => {
                        const overallScore = getEvaluationAverage(run);

                        return (
                          <tr key={run.id} className="align-top hover:bg-slate-50/70">
                            <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3">
                              <p className="font-semibold text-slate-900">{run.subject_name || "Untitled"}</p>
                              <p className="mt-1 text-slate-500">Evaluation #{run.id}</p>
                              <p className="mt-1 text-slate-500">{new Date(run.created_at).toLocaleString()}</p>
                            </td>
                            <td className="border-l border-slate-200 px-3 py-3 text-center text-slate-700">
                              {run.employee_number || "-"}
                            </td>
                            <td className="border-l border-slate-200 px-3 py-3 text-center font-bold text-[#04418b]">
                              {overallScore === null ? "-" : overallScore.toFixed(1)}
                            </td>
                            <td className="border-l border-slate-200 px-4 py-3 leading-5 text-slate-600">
                              <p className="line-clamp-4 whitespace-pre-wrap">
                                {run.overall_suggestion?.trim() || "-"}
                              </p>
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
                                      setSelectedAnalysisIds((current) =>
                                        event.target.checked
                                          ? [...new Set([...current, run.id])]
                                          : current.filter((id) => id !== run.id),
                                      );
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
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Aggregate history
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Combined evaluation summaries for this Video Case.
                </p>
              </div>

              {aggregateHistory.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  No evaluation summaries have been combined for this Video Case yet.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[1080px] border-collapse text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        {[
                          "Aggregate",
                          "Created",
                          "Created by",
                          "Employee no.",
                          "Sources",
                          "Analysis",
                          "Document",
                          "Action",
                        ].map((label) => (
                          <th
                            key={label}
                            className="border-b border-slate-200 px-4 py-3 font-semibold"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {aggregateHistory.map(({ aggregate, item }) => (
                        <tr
                          key={item.aggregateId}
                          className="align-top hover:bg-slate-50/70"
                        >
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">
                              {item.shortAggregateId}
                            </p>
                            <p className="mt-1 break-all text-slate-400">
                              {item.aggregateId}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {item.createdAt
                              ? new Date(item.createdAt).toLocaleString()
                              : "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {item.creatorName}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {item.employeeNumber}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <p>{item.sourceCount} evaluation(s)</p>
                            <p className="mt-1">
                              {item.sourceEvaluationIds.length
                                ? item.sourceEvaluationIds
                                    .map((id) => `#${id}`)
                                    .join(", ")
                                : "-"}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {item.analysisStatus}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {item.documentStatus}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-3">
                              <Link
                                to={buildVideoCaseAggregateSummaryPath(selectedCase.id, item.aggregateId)}
                                className="font-semibold text-[#04418b] hover:underline"
                              >
                                View summary
                              </Link>
                              {canCombine && (
                                <button
                                  type="button"
                                  onClick={() => setAggregateToDelete(aggregate)}
                                  className="font-semibold text-red-600 hover:text-red-800"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

          </div>
        )}
      </main>
    </div>
  );
}
