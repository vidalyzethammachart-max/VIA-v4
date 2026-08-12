import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import MainNavbar from "../components/MainNavbar";
import { supabase } from "../lib/supabaseClient";
import {
  getVideoCaseAggregate,
  getVideoCaseAggregateDocumentUrls,
  buildVideoCaseSummaryPayload,
  sendVideoCaseAggregateToN8n,
  type VideoCaseAggregateRow,
} from "../services/videoCaseService";

type AggregateSnapshot = Record<string, unknown> & {
  case_id?: string;
  case_title?: string;
  source_runs?: Array<Record<string, unknown>>;
  question_averages_by_section?: Record<string, unknown>;
  question_averages?: Record<string, unknown>;
  section_averages?: Record<string, unknown>;
};

function getAggregateSummary(output: unknown, rawText: string | null): string {
  if (typeof output === "string" && output.trim()) {
    return output;
  }

  if (!output || typeof output !== "object") {
    return rawText || "No AI analysis available yet.";
  }

  const record = output as Record<string, unknown>;
  const keys = ["summary", "consensus", "recommendations", "issues", "strengths"];
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key].trim()) {
      return record[key];
    }
  }

  return rawText || "Structured aggregate analysis is available. Open details to inspect it.";
}

function averageFromQuestions(questions: Record<string, unknown> | undefined): number | null {
  if (!questions || typeof questions !== "object") {
    return null;
  }

  const values = Object.values(questions)
    .map((value) => (typeof value === "string" ? Number(value) : value))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, score) => sum + score, 0);
  return total / values.length;
}

export default function VideoCaseAggregateReviewPage() {
  const { videoCaseId, aggregateId } = useParams<{ videoCaseId: string; aggregateId: string }>();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [aggregate, setAggregate] = useState<VideoCaseAggregateRow | null>(null);
  const [artifactUrls, setArtifactUrls] = useState<{ pdfUrl: string | null; docxUrl: string | null } | null>(null);
  const [currentEmployeeNumber, setCurrentEmployeeNumber] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!aggregateId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErrorMessage(null);
        const row = await getVideoCaseAggregate(aggregateId);
        setAggregate(row);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load aggregate review.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [aggregateId]);

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
    const loadUrls = async () => {
      if (!aggregate || aggregate.document_status !== "ready") {
        setArtifactUrls(null);
        return;
      }

      if (!aggregate.pdf_storage_path && !aggregate.docx_storage_path) {
        setArtifactUrls(null);
        return;
      }

      try {
        setArtifactLoading(true);
        const urls = await getVideoCaseAggregateDocumentUrls(aggregate.id);
        setArtifactUrls(urls);
      } catch {
        setArtifactUrls(null);
      } finally {
        setArtifactLoading(false);
      }
    };

    void loadUrls();
  }, [aggregate]);

  const snapshot = useMemo(() => (aggregate?.source_snapshot || {}) as AggregateSnapshot, [aggregate]);
  const sourceRuns = snapshot.source_runs || [];
  const questionAverages = (snapshot.question_averages_by_section ||
    snapshot.question_averages ||
    aggregate?.combined_scores ||
    {}) as Record<string, Record<string, unknown>>;
  const sectionAverages = (snapshot.section_averages || aggregate?.section_averages || {}) as Record<string, unknown>;
  const aggregateAverage = averageFromQuestions(sectionAverages);
  const summaryPreview = useMemo(() => {
    if (!aggregate) {
      return null;
    }

    return buildVideoCaseSummaryPayload({
      aggregate,
      requestedByEmployeeNumber: currentEmployeeNumber,
      combinePrompt: typeof snapshot.combine_prompt === "string" ? snapshot.combine_prompt : null,
    });
  }, [aggregate, currentEmployeeNumber, snapshot.combine_prompt]);

  const handleSend = async () => {
    if (!aggregate) return;

    try {
      setSending(true);
      setErrorMessage(null);
      const updated = await sendVideoCaseAggregateToN8n(aggregate.id);
      setAggregate(updated);
      setSuccessMessage("Aggregate analysis sent to n8n.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to send aggregate analysis.");
    } finally {
      setSending(false);
    }
  };

  if (!videoCaseId || !aggregateId) {
    return <Navigate to="/video-cases" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
      <main className="mx-auto max-w-7xl px-4 py-6 md:py-8">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#04418b]">Aggregate review</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              {snapshot.case_title || "Aggregate analysis"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Review the combined scores and AI summary before sending the aggregate to n8n.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/video-cases?caseId=${videoCaseId}&aggregateId=${aggregateId}`} className="btn-secondary">
              Back to video case
            </Link>
            <button type="button" onClick={() => void handleSend()} disabled={sending || !aggregate} className="btn-primary">
              {sending ? "Sending..." : "Analyze with n8n"}
            </button>
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
            Loading aggregate review...
          </section>
        ) : !aggregate ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700 shadow-sm">
            Aggregate not found.
          </section>
        ) : (
          <div className="space-y-6">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-5 p-5 md:flex-row md:items-start md:justify-between md:p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#04418b]">Current draft</p>
                  <h2 className="mt-2 text-2xl font-bold text-slate-900">
                    {snapshot.case_title || "Aggregate analysis"}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Aggregate ID: {aggregate.id}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Source evaluations: {aggregate.source_count}
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    aggregate.document_status === "ready"
                      ? "bg-emerald-50 text-emerald-700"
                      : aggregate.document_status === "failed"
                        ? "bg-red-50 text-red-700"
                        : "bg-amber-50 text-amber-700"
                  }`}>
                    Document: {aggregate.document_status}
                  </span>
                  {aggregateAverage !== null && (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      Average of section roll-ups: {aggregateAverage.toFixed(2)}
                    </span>
                  )}
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    Sender employee no.: {currentEmployeeNumber || "-"}
                  </span>
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
                <h3 className="text-lg font-semibold text-slate-900">Section averages</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Use these values as the top-level roll-up before re-analysis.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(sectionAverages).map(([sectionId, value]) => (
                    <div key={sectionId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#04418b]">
                        Section {sectionId}
                      </p>
                      <p className="mt-2 text-3xl font-bold text-slate-900">
                        {typeof value === "number" ? value.toFixed(2) : "-"}
                      </p>
                    </div>
                  ))}
                  {Object.keys(sectionAverages).length === 0 && (
                    <p className="text-sm text-slate-500">No section averages available.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">AI summary</h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {getAggregateSummary(aggregate.ai_output, aggregate.ai_raw_text)}
                </p>
                <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
                  <p className="font-semibold text-slate-700">Status</p>
                  <p className="mt-2">AI model: {aggregate.ai_model || "-"}</p>
                  <p className="mt-1">Source count: {aggregate.source_count}</p>
                  <p className="mt-1">Document: {aggregate.document_status}</p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Question averages by section</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    This is the numeric input to compare question-by-question before sending to n8n.
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-4">
                {Object.entries(questionAverages).map(([sectionId, questions]) => (
                  <details key={sectionId} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                      Section {sectionId}
                    </summary>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {Object.entries(questions || {}).map(([questionId, value]) => (
                        <div key={questionId} className="rounded-lg bg-white p-3 text-sm shadow-sm">
                          <p className="text-xs font-medium text-slate-500">{questionId}</p>
                          <p className="mt-1 text-lg font-bold text-slate-900">
                            {typeof value === "number" ? value.toFixed(2) : String(value ?? "-")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Source analyses</h3>
              <p className="mt-1 text-sm text-slate-500">
                These are the selected evaluations that were combined into the summary.
              </p>
              <div className="mt-4 space-y-3">
                {sourceRuns.map((run, index) => (
                  <article key={`${run.id || index}`} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">
                          Evaluation #{String(run.evaluation_id || run.id || index + 1)}
                        </p>
                        <p className="text-xs text-slate-500">
                          Employee no.: {String(run.employee_number || run.analyst_user_id || "-")}
                        </p>
                      </div>
                      <p className="text-xs text-slate-500">
                        {run.created_at ? new Date(String(run.created_at)).toLocaleString() : "-"}
                      </p>
                    </div>
                    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                      <p className="font-medium text-slate-800">AI analysis</p>
                      <p className="mt-2 whitespace-pre-wrap text-slate-700">
                        {typeof run.ai_output === "string"
                          ? run.ai_output
                          : typeof run.ai_raw_text === "string"
                            ? run.ai_raw_text
                            : run.notes || "No AI text available."}
                      </p>
                    </div>
                  </article>
                ))}
                {sourceRuns.length === 0 && (
                  <p className="text-sm text-slate-500">No source evaluations were found in the draft.</p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">JSON preview</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    This is the single combined payload that will be sent to n8n after confirmation.
                  </p>
                </div>
              </div>
              <pre className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                {JSON.stringify(summaryPreview, null, 2)}
              </pre>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Document status</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Send the draft to n8n only after you confirm the combined numbers and AI summary.
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Sender employee no.: {currentEmployeeNumber || "-"}
                    </p>
                  </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={sending}
                    className="btn-primary"
                  >
                    {sending ? "Sending..." : "Analyze with n8n"}
                  </button>
                  <Link to={`/video-cases?caseId=${videoCaseId}&aggregateId=${aggregateId}`} className="btn-secondary">
                    Back
                  </Link>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-1 font-semibold ${
                  aggregate.document_status === "ready"
                    ? "bg-emerald-50 text-emerald-700"
                    : aggregate.document_status === "failed"
                      ? "bg-red-50 text-red-700"
                      : "bg-amber-50 text-amber-700"
                }`}>
                  {aggregate.document_status}
                </span>
                {aggregate.document_status === "ready" && artifactUrls?.pdfUrl && (
                  <a href={artifactUrls.pdfUrl} target="_blank" rel="noreferrer" className="btn-secondary px-3 py-1 text-xs">
                    Open PDF
                  </a>
                )}
                {aggregate.document_status === "ready" && artifactUrls?.docxUrl && (
                  <a href={artifactUrls.docxUrl} target="_blank" rel="noreferrer" className="btn-secondary px-3 py-1 text-xs">
                    Open DOCX
                  </a>
                )}
                {aggregate.document_status === "failed" && aggregate.document_error && (
                  <span className="text-red-600">{aggregate.document_error}</span>
                )}
                {artifactLoading && <span className="text-slate-500">Loading artifacts...</span>}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
