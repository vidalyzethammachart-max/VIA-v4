import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import ConfirmModal from "../components/ConfirmModal";
import ErrorNoticeModal from "../components/ErrorNoticeModal";
import MainNavbar from "../components/MainNavbar";
import { SectionCard } from "../components/SectionCard";
import { getLikertLabels, getSections, type LikertValue } from "../config/sections";
import { useAuthRole } from "../hooks/useAuthRole";
import { useLanguage } from "../i18n/useLanguage";
import { normalizeRole, roleAtLeast } from "../lib/roles";
import { reportError } from "../services/errorReporter";
import { buildCombinedSuggestionDraft } from "../services/videoCaseSummaryPayloadCore";
import { getMyVideoCases } from "../services/videoCaseService";
import { buildVideoGroupDisplayName } from "../services/videoGroupCore.js";
import {
  deleteVideoGroup,
  getVideoGroup,
  getVideoGroupSources,
  sendVideoGroupToN8n,
  type VideoGroupRow,
} from "../services/videoGroupService";

type GroupSnapshot = Record<string, unknown> & {
  source_runs?: Array<Record<string, unknown>>;
  question_averages_by_section?: Record<string, unknown>;
};

type GroupSource = { evaluation_id: number; video_case_id: string; source_position: number };

function toLikertValue(value: unknown): LikertValue | undefined {
  const numericValue = Math.round(Number(value));
  if (!Number.isFinite(numericValue) || numericValue < 1 || numericValue > 5) {
    return undefined;
  }

  return numericValue as LikertValue;
}

export default function VideoGroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { role, user } = useAuthRole();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [group, setGroup] = useState<VideoGroupRow | null>(null);
  const [sources, setSources] = useState<GroupSource[]>([]);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [caseLabels, setCaseLabels] = useState<Record<string, string>>({});
  const [overallSuggestion, setOverallSuggestion] = useState("");
  const [sending, setSending] = useState(false);
  const submittingRef = useRef(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmBack, setConfirmBack] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);
        setGroup(null);
        setSources([]);
        setCaseLabels({});
        setSendError(null);
        setSourcesError(null);
        const row = await getVideoGroup(groupId);
        if (cancelled) return;
        setGroup(row);
        if (row) {
          // Case information comes from the sources table (video_case_id), not the snapshot.
          try {
            const rows = await getVideoGroupSources(row.id);
            if (cancelled) return;
            setSources(rows);
          } catch (sourcesLoadError) {
            if (!cancelled) {
              setSourcesError(
                sourcesLoadError instanceof Error && sourcesLoadError.message
                  ? sourcesLoadError.message
                  : t("videoGroups.sourcesLoadFailed"),
              );
            }
          }
          try {
            const cases = await getMyVideoCases();
            if (!cancelled) {
              setCaseLabels(
                Object.fromEntries(cases.map((item) => [item.id, item.case_title || item.case_key])),
              );
            }
          } catch {
            // Labels are best effort; the case id is shown as a fallback.
          }
        }
      } catch (error) {
        if (!cancelled) {
          setGroup(null);
          setErrorMessage(error instanceof Error ? error.message : t("videoGroups.detailLoadFailed"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const snapshot = useMemo(() => (group?.source_snapshot || {}) as GroupSnapshot, [group]);
  const sections = useMemo(() => getSections(language), [language]);
  const likertLabels = useMemo(() => getLikertLabels(language), [language]);
  const sourceRuns = useMemo(
    () =>
      (Array.isArray(snapshot.source_runs) ? snapshot.source_runs : []).filter(
        (run): run is Record<string, unknown> => Boolean(run) && typeof run === "object",
      ),
    [snapshot.source_runs],
  );

  useEffect(() => {
    setOverallSuggestion(buildCombinedSuggestionDraft(sourceRuns));
  }, [sourceRuns]);

  const questionAverages = useMemo(
    () => (snapshot.question_averages_by_section || {}) as Record<string, Record<string, unknown>>,
    [snapshot.question_averages_by_section],
  );
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

  const isAdmin = roleAtLeast(normalizeRole(role), "admin");
  // UX only: begin_document_dispatch still authorizes requested_by or an admin.
  const canSend = Boolean(group && user && (group.requested_by === user.id || isAdmin));

  async function handleSend() {
    if (!group || !canSend || submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    try {
      setSending(true);
      setSendError(null);
      const updated = await sendVideoGroupToN8n(group.id, overallSuggestion.trim() || null);
      setGroup(updated);
      navigate(`/video-groups/${updated.id}/preview`);
    } catch (error) {
      reportError(error, { source: "popup", context: { action: "send_group", groupId: group.id } });
      setSendError(error instanceof Error ? error.message : t("videoGroups.sendFailed"));
    } finally {
      submittingRef.current = false;
      setSending(false);
    }
  }

  // Back from a draft: discard it (delete policy) and reopen the create form with the same values.
  async function handleDiscardDraft() {
    if (!group || discarding) return;
    try {
      setDiscarding(true);
      await deleteVideoGroup(group.id);
      navigate("/video-groups/new", {
        state: {
          orderNumber: group.order_number,
          groupType: group.group_type,
          subjectName: group.subject_name,
          evaluationIds: sources.map((source) => source.evaluation_id),
        },
      });
    } catch (error) {
      setConfirmBack(false);
      reportError(error, { source: "popup", context: { action: "discard_group_draft", groupId: group.id } });
      setSendError(error instanceof Error ? error.message : t("videoGroups.deleteFailed"));
    } finally {
      setDiscarding(false);
    }
  }

  if (!groupId) {
    return <Navigate to="/video-groups" replace />;
  }

  const documentStatus = group?.document_status;
  const canGoBack = Boolean(canSend && documentStatus === "draft" && !sourcesError && sources.length > 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
      <ErrorNoticeModal isOpen={sendError !== null} detail={sendError} onClose={() => setSendError(null)} />
      <ConfirmModal
        isOpen={confirmBack}
        title={t("videoGroups.backTitle")}
        message={t("videoGroups.backMessage")}
        confirmLabel={discarding ? t("videoGroups.deleting") : t("videoGroups.backConfirm")}
        cancelLabel={t("videoGroups.deleteCancel")}
        confirmDisabled={discarding}
        onConfirm={() => void handleDiscardDraft()}
        onCancel={() => setConfirmBack(false)}
      />
      <main className="mx-auto max-w-5xl px-4 py-6 md:py-8">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {group ? buildVideoGroupDisplayName(group.group_type, group.subject_name) : t("videoGroups.listTitle")}
            </h1>
            {group && <p className="mt-1 text-sm text-slate-500">{t("videoGroups.detailSubtitle")}</p>}
          </div>
          <Link to="/video-groups" className="btn-secondary">
            {t("videoGroups.backToList")}
          </Link>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            {t("videoGroups.detailLoading")}
          </section>
        ) : !group ? (
          !errorMessage && (
            <section className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700 shadow-sm">
              <p>{t("videoGroups.notFound")}</p>
              <Link to="/video-groups" className="btn-secondary mt-4 inline-flex">
                {t("videoGroups.backToList")}
              </Link>
            </section>
          )
        ) : (
          <form
            className="space-y-6"
            aria-busy={sending}
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
          >
            <section className="ui-hover-card space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                  {t("videoGroups.orderNumber")}: {group.order_number}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                  {t("videoGroups.sourceCount", { count: group.source_count })}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                  {t(`videoGroups.docStatus.${group.document_status}`)}
                </span>
              </div>

              {(documentStatus === "ready" || documentStatus === "pending") && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to={`/video-groups/${group.id}/preview`} className="btn-primary">
                    {t("videoGroups.viewPreview")}
                  </Link>
                </div>
              )}
              {documentStatus === "draft" && (
                <p className="mt-4 text-sm text-slate-600" role="status">
                  {t("videoGroups.docDraft")}
                </p>
              )}
              {documentStatus === "pending" && (
                <p className="mt-4 text-sm text-slate-600" role="status">
                  {t("videoGroups.docPending")}
                </p>
              )}
              {documentStatus === "failed" && (
                <p className="mt-4 text-sm text-red-700" role="alert">
                  {t("videoGroups.docFailed")}
                  {group.document_error ? `: ${group.document_error}` : ""}
                </p>
              )}
            </section>

            <section className="ui-hover-card space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-slate-900 md:text-base">{t("form.rubricTitle")}</h2>
                <p className="text-xs text-slate-600 md:text-sm">{t("form.rubricDescription")}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-600 md:text-sm">
                {([1, 2, 3, 4, 5] as LikertValue[]).map((value) => (
                  <div
                    key={value}
                    className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1"
                  >
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                      {value}
                    </span>
                    <span>{likertLabels[value]}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="ui-hover-card space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
              <h2 className="text-sm font-semibold text-slate-900 md:text-base">{t("videoGroups.combinedRubric")}</h2>
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

            <section className="ui-hover-card space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
              <h2 className="text-sm font-semibold text-slate-900 md:text-base">{t("videoGroups.sourcesTitle")}</h2>
              {sourcesError ? (
                <p className="mt-3 text-sm text-red-700" role="alert">
                  {t("videoGroups.sourcesLoadFailed")}: {sourcesError}
                </p>
              ) : sources.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">{t("videoGroups.noSources")}</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 text-sm">
                  {sources.map((source) => (
                    <li key={source.evaluation_id} className="flex flex-wrap items-center gap-3 py-2">
                      <span className="font-semibold text-slate-900">
                        {t("videoGroups.sourcesEvaluation")} #{source.evaluation_id}
                      </span>
                      <span className="text-slate-600">
                        {t("videoGroups.sourcesCase")}: {caseLabels[source.video_case_id] || source.video_case_id}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="ui-hover-card space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
              <label htmlFor="group-overall-suggestion" className="text-sm font-semibold text-slate-800">
                {t("videoGroups.overallSuggestion")}
              </label>
              <p className="text-xs text-slate-500">{t("videoGroups.overallSuggestionHint")}</p>
              <textarea
                id="group-overall-suggestion"
                disabled={sending}
                value={overallSuggestion}
                onChange={(event) => setOverallSuggestion(event.target.value)}
                rows={5}
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/60"
              />
            </section>

            <div className="flex flex-wrap items-center justify-center gap-3">
              {canGoBack && (
                <button
                  type="button"
                  className="btn-secondary rounded-full px-6 py-2 text-base"
                  disabled={sending || discarding}
                  onClick={() => setConfirmBack(true)}
                >
                  {t("common.back")}
                </button>
              )}
              {canSend ? (
                <button
                  type="submit"
                  className="btn-primary rounded-full px-6 py-2 text-base shadow-md"
                  disabled={sending || documentStatus === "ready"}
                >
                  {sending
                    ? t("videoGroups.sending")
                    : documentStatus === "failed"
                      ? t("videoGroups.resend")
                      : t("videoGroups.send")}
                </button>
              ) : (
                <p className="text-sm text-slate-500" role="status">
                  {t("videoGroups.sendNotAllowed")}
                </p>
              )}
            </div>
            {canSend && (
              <p className="text-center text-sm text-slate-500" role="status">
                {t("videoGroups.sendHint")}
              </p>
            )}
          </form>
        )}
      </main>
    </div>
  );
}
