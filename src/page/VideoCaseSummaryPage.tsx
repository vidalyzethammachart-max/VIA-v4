import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { SectionCard } from "../components/SectionCard";
import MainNavbar from "../components/MainNavbar";
import { getSections, type LikertValue } from "../config/sections";
import { useLanguage } from "../i18n/useLanguage";
import { supabase } from "../lib/supabaseClient";
import { buildVideoCaseSummaryDocumentPreviewPath } from "../services/videoCaseSummaryDocumentPreviewCore";
import {
  buildVideoCaseSummaryPayload,
  getVideoCaseAnalyses,
  getVideoCaseAggregate,
  getVideoCaseAggregateSourceIds,
  sendVideoCaseAggregateToN8nWithPrompt,
  type VideoCaseEvaluationRow,
  type VideoCaseAggregateRow,
} from "../services/videoCaseService";

type AggregateSnapshot = Record<string, unknown> & {
  case_id?: string;
  case_title?: string;
  source_runs?: Array<Record<string, unknown>>;
  question_averages_by_section?: Record<string, unknown>;
  question_averages?: Record<string, unknown>;
  section_averages?: Record<string, unknown>;
  combine_prompt?: string | null;
};

function toLikertValue(value: unknown): LikertValue | undefined {
  const numericValue = Math.round(Number(value));
  if (!Number.isFinite(numericValue) || numericValue < 1 || numericValue > 5) {
    return undefined;
  }

  return numericValue as LikertValue;
}

export default function VideoCaseSummaryPage() {
  const navigate = useNavigate();
  const { videoCaseId, summaryId, aggregateId } = useParams<{
    videoCaseId: string;
    summaryId?: string;
    aggregateId?: string;
  }>();
  const summaryKey = summaryId || aggregateId || "";
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [aggregate, setAggregate] = useState<VideoCaseAggregateRow | null>(null);
  const [caseAnalyses, setCaseAnalyses] = useState<VideoCaseEvaluationRow[]>([]);
  const [sourceEvaluationIds, setSourceEvaluationIds] = useState<number[]>([]);
  const [currentEmployeeNumber, setCurrentEmployeeNumber] = useState<string | null>(null);
  const [overallSuggestion, setOverallSuggestion] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!summaryKey) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErrorMessage(null);
        const row = await getVideoCaseAggregate(summaryKey);
        setAggregate(row);
        setSourceEvaluationIds(
          row
            ? await getVideoCaseAggregateSourceIds(row.id, row.source_evaluation_ids)
            : [],
        );
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load summary preview.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [summaryKey]);

  useEffect(() => {
    const loadEmployeeNumber = async () => {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) {
        setCurrentEmployeeNumber(null);
        return;
      }

      const { data, error } = await supabase
        .from("user_information")
        .select("employee_number")
        .eq("auth_user_id", userData.user.id)
        .maybeSingle();

      if (error) {
        setCurrentEmployeeNumber(null);
        return;
      }

      setCurrentEmployeeNumber(
        typeof data?.employee_number === "string" && data.employee_number.trim()
          ? data.employee_number.trim()
          : null,
      );
    };

    void loadEmployeeNumber();
  }, []);

  useEffect(() => {
    const loadCaseAnalyses = async () => {
      if (!videoCaseId) {
        setCaseAnalyses([]);
        return;
      }

      try {
        const rows = await getVideoCaseAnalyses(videoCaseId);
        setCaseAnalyses(rows);
      } catch {
        setCaseAnalyses([]);
      }
    };

    void loadCaseAnalyses();
  }, [videoCaseId]);

  const snapshot = useMemo(() => (aggregate?.source_snapshot || {}) as AggregateSnapshot, [aggregate]);
  const sections = useMemo(() => getSections(language), [language]);
  const sourceRuns = useMemo(
    () =>
      (Array.isArray(snapshot.source_runs) ? snapshot.source_runs : [])
        .map((run) => (run && typeof run === "object" ? (run as Record<string, unknown>) : null))
        .filter((run): run is Record<string, unknown> => Boolean(run)),
    [snapshot.source_runs],
  );
  const summaryOrderNumber =
    sourceRuns.find((run) => typeof run.order_number === "string" && run.order_number.trim())
      ?.order_number ?? null;
  const summarySubjectName =
    sourceRuns.find((run) => typeof run.subject_name === "string" && run.subject_name.trim())
      ?.subject_name ?? snapshot.case_title ?? null;
  const displaySourceRows = useMemo(() => {
    if (sourceRuns.length > 0) {
      return sourceRuns;
    }

    if (caseAnalyses.length === 0 || sourceEvaluationIds.length === 0) {
      return [];
    }

    const analysesById = new Map(caseAnalyses.map((analysis) => [analysis.id, analysis]));
    return sourceEvaluationIds
      .map((evaluationId) => analysesById.get(evaluationId))
      .filter((analysis): analysis is VideoCaseEvaluationRow => Boolean(analysis))
      .map((analysis) => ({
        id: analysis.id,
        analyst_user_id: analysis.user_id,
        evaluation_id: analysis.id,
        employee_number: analysis.employee_number,
        run_kind: analysis.analysis_kind,
        rubric: analysis.rubric,
        matrix: {},
        ai_output: analysis.analysis_ai_output,
        ai_raw_text: analysis.analysis_ai_raw_text,
        notes: analysis.overall_suggestion,
        created_at: analysis.created_at,
        order_number: analysis.order_number,
      }));
  }, [caseAnalyses, sourceEvaluationIds, sourceRuns]);
  const summaryPreview = useMemo(() => {
    if (!aggregate) {
      return null;
    }

    return buildVideoCaseSummaryPayload({
      aggregate,
      requestedByEmployeeNumber: currentEmployeeNumber,
      combinePrompt:
        typeof overallSuggestion === "string" && overallSuggestion.trim()
          ? overallSuggestion.trim()
          : null,
    });
  }, [aggregate, currentEmployeeNumber, overallSuggestion]);

  async function handleSendSummary() {
    if (!aggregate) {
      return;
    }

    try {
      setSending(true);
      setSendError(null);
      await sendVideoCaseAggregateToN8nWithPrompt(aggregate.id, overallSuggestion.trim() || null);
      navigate("/my-forms", {
        state: {
          generated: true,
          aggregateId: aggregate.id,
          submissionId: aggregate.id,
        },
        replace: true,
      });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to send summary.");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    const initialSuggestion =
      typeof snapshot.combine_prompt === "string" && snapshot.combine_prompt.trim()
        ? snapshot.combine_prompt.trim()
        : "";
    setOverallSuggestion(initialSuggestion);
  }, [snapshot.combine_prompt]);

  const questionAverages = (snapshot.question_averages_by_section ||
    snapshot.question_averages ||
    aggregate?.combined_scores ||
    {}) as Record<string, Record<string, unknown>>;
  const prefilledAnswers = useMemo(
    () =>
      sections.reduce<Record<string, Record<string, LikertValue | undefined>>>((acc, section) => {
        const sectionValues = questionAverages[section.id] || {};
        acc[section.id] = section.questions.reduce<Record<string, LikertValue | undefined>>(
          (questionAcc, question) => {
            questionAcc[question.id] = toLikertValue(sectionValues[question.id]);
            return questionAcc;
          },
          {},
        );
        return acc;
      }, {}),
    [questionAverages, sections],
  );

  if (!videoCaseId || !summaryKey) {
    return <Navigate to="/video-cases" replace />;
  }

  const documentActionLabel =
    aggregate?.document_status === "ready" &&
    (aggregate.pdf_storage_path || aggregate.docx_storage_path)
      ? "ดูเอกสาร"
      : aggregate?.document_status === "pending" || aggregate?.document_status === "failed"
        ? "ตรวจสอบสถานะเอกสาร"
        : null;
  const documentPreviewPath =
    aggregate && documentActionLabel
      ? buildVideoCaseSummaryDocumentPreviewPath(videoCaseId, aggregate.id)
      : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
      <main className="mx-auto max-w-7xl px-4 py-6 md:py-8">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#04418b]">Summary preview</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              {snapshot.case_title || "Summary analysis"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Review the combined scores, AI summary, and the exact payload that would be sent later.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {documentPreviewPath && (
              <Link to={documentPreviewPath} className="btn-primary">
                {documentActionLabel === "ดูเอกสาร" ? (
                  <>ดูเอกสาร</>
                ) : (
                  <>ตรวจสอบสถานะเอกสาร</>
                )}
              </Link>
            )}
            <Link to={`/video-cases/${videoCaseId}`} className="btn-secondary">
              Back to video case
            </Link>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}
        {sendError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {sendError}
          </div>
        )}

        {loading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            Loading summary preview...
          </section>
        ) : !aggregate ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700 shadow-sm">
            Summary not found.
          </section>
        ) : (
          <div className="space-y-6">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-5 p-5 md:flex-row md:items-start md:justify-between md:p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#04418b]">
                    Combined evaluation draft
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-slate-900">
                    {snapshot.case_title || "Summary analysis"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-slate-500">
                    This draft combines selected evaluation results so they can be reviewed before any future send.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                      Order no.: {summaryOrderNumber || "-"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                      Subject: {summarySubjectName || "-"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                      Source evaluations: {aggregate.source_count}
                    </span>
                  </div>
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Source evaluation IDs
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {sourceEvaluationIds.length > 0 ? (
                        sourceEvaluationIds.map((evaluationId) => (
                          <span
                            key={evaluationId}
                            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                          >
                            #{evaluationId}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">No evaluation IDs found.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Combined rubric preview</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Prefilled with the average score of each question from the selected evaluations.
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-5">
                {sections.map((section) => (
                  <div key={section.id} className="pointer-events-none">
                    <SectionCard
                      section={section}
                      answers={prefilledAnswers[section.id] || {}}
                      onToggle={() => undefined}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-800">
                  ข้อเสนอแนะโดยรวม <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-slate-500">สรุปประเด็นสำคัญ จุดเด่น และข้อเสนอแนะเพื่อปรับปรุง</p>
                <textarea
                  value={overallSuggestion}
                  onChange={(event) => setOverallSuggestion(event.target.value)}
                  rows={4}
                  required
                  className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/60"
                  placeholder="สรุปผลการประเมินสำหรับเคสนี้..."
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Source analyses</h3>
              <p className="mt-1 text-sm text-slate-500">
                These are the selected evaluations that will be used to build the preview payload.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                      <th className="border-b border-slate-200 px-4 py-3 font-semibold">Evaluation ID</th>
                      <th className="border-b border-slate-200 px-4 py-3 font-semibold">Employee no.</th>
                      <th className="border-b border-slate-200 px-4 py-3 font-semibold">Created at</th>
                      <th className="border-b border-slate-200 px-4 py-3 font-semibold">Overall suggestion</th>
                      <th className="border-b border-slate-200 px-4 py-3 font-semibold">AI analysis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displaySourceRows.map((run, index) => (
                      <tr key={`${run.id || index}`} className="align-top">
                        <td className="border-b border-slate-100 px-4 py-4 font-semibold text-slate-900">
                          #{String(run.evaluation_id || run.id || index + 1)}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 text-slate-700">
                          {String(run.employee_number || run.analyst_user_id || "-")}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 text-slate-600">
                          {run.created_at ? new Date(String(run.created_at)).toLocaleString() : "-"}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 text-slate-700">
                          <p className="max-w-md whitespace-pre-wrap">
                            {typeof run.notes === "string" && run.notes.trim()
                              ? run.notes
                              : "No overall suggestion available."}
                          </p>
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 text-slate-700">
                          <p className="max-w-md whitespace-pre-wrap">
                            {typeof run.ai_output === "string"
                              ? run.ai_output
                              : typeof run.ai_raw_text === "string"
                                ? run.ai_raw_text
                                : run.notes || "No AI text available."}
                          </p>
                        </td>
                      </tr>
                    ))}
                    {displaySourceRows.length === 0 && (
                      <tr>
                        <td className="px-4 py-4 text-slate-500" colSpan={5}>
                          No source evaluations were found in the draft.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">JSON preview</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    This is the exact payload that would be sent later. Sending is disabled in v4 for now.
                  </p>
                </div>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  Preview only
                </span>
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <pre className="overflow-x-auto text-xs leading-5 text-slate-800">
                  {JSON.stringify(summaryPreview, null, 2)}
                </pre>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Preview status</h3>
              <p className="mt-2 text-sm text-slate-600">
                V4 shows the combined payload and lets you send it to n8n for testing.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void handleSendSummary()}
                  disabled={sending}
                >
                  {sending ? "Sending..." : "Send to n8n"}
                </button>
                <Link to={`/video-cases/${videoCaseId}`} className="btn-secondary">
                  Back to video case
                </Link>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
