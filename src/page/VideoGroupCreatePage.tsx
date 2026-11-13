import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import CaseEvaluationPicker from "../components/CaseEvaluationPicker";
import ErrorNoticeModal from "../components/ErrorNoticeModal";
import MainNavbar from "../components/MainNavbar";
import { useLanguage } from "../i18n/useLanguage";
import { getCombineBlockReason, keepCombinableSelection } from "../services/videoCaseCombineSelectionCore.js";
import { reportError } from "../services/errorReporter";
import {
  GROUP_TYPE_MAX_LENGTH,
  GROUP_TYPES,
  getGroupTypeLabel,
  resolveGroupType,
  validateVideoGroupForm,
} from "../services/videoGroupCore.js";
import {
  createVideoGroupEvaluation,
  getSelectableEvaluations,
  type SelectableEvaluationRow,
  type VideoGroupType,
} from "../services/videoGroupService";

// Same field styling as the evaluation form (/form-submit).
const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";
const cardClass = "ui-hover-card space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6";

// Values handed back by the group detail page when a draft is discarded to be edited again.
type CreatePrefill = {
  orderNumber?: string;
  groupType?: VideoGroupType;
  subjectName?: string;
  evaluationIds?: number[];
};

export default function VideoGroupCreatePage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const location = useLocation();
  const prefill = (location.state ?? {}) as CreatePrefill;
  const [searchParams] = useSearchParams();
  const requestedCaseId = searchParams.get("caseId")?.trim() || "";

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorPopup, setErrorPopup] = useState<string | null>(null);
  const [loadErrorPopup, setLoadErrorPopup] = useState<string | null>(null);
  const [evaluations, setEvaluations] = useState<SelectableEvaluationRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>(() => (Array.isArray(prefill.evaluationIds) ? prefill.evaluationIds : []));
  const [search, setSearch] = useState("");
  const [orderNumber, setOrderNumber] = useState(prefill.orderNumber ?? "");
  // Free text shown as typed; a stored suggestion value is displayed as its label.
  const [groupType, setGroupType] = useState(() => getGroupTypeLabel(prefill.groupType ?? ""));
  const [subjectName, setSubjectName] = useState(prefill.subjectName ?? "");
  const [touched, setTouched] = useState(false);
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        setLoading(true);
        setErrorMessage(null);
        const rows = await getSelectableEvaluations();
        if (!active) return;
        setEvaluations(rows);
        if (requestedCaseId && !(Array.isArray(prefill.evaluationIds) && prefill.evaluationIds.length > 0)) {
          setSelectedIds(rows.filter((row) => row.video_case_id === requestedCaseId).map((row) => row.id));
        }
      } catch (error) {
        if (active) {
          const message = error instanceof Error ? error.message : t("videoGroups.loadFailed");
          reportError(error, { source: "popup", context: { action: "load_selectable_evaluations" } });
          setErrorMessage(message);
          setLoadErrorPopup(message);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedCaseId]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return evaluations;
    return evaluations.filter((row) =>
      [row.order_number, row.subject_name, row.video_cases?.case_title, row.video_cases?.case_key].some((value) =>
        String(value ?? "").toLowerCase().includes(needle),
      ),
    );
  }, [evaluations, search]);

  // Selection is kept across searches, so it is resolved against the full list.
  const selected = useMemo(() => {
    const ids = new Set(keepCombinableSelection(evaluations, selectedIds));
    return evaluations.filter((row) => ids.has(row.id));
  }, [evaluations, selectedIds]);

  const blockReason = getCombineBlockReason(evaluations, selectedIds);
  const formMessage = validateVideoGroupForm({ orderNumber, groupType, subjectName });

  async function handleCreate() {
    if (busy) return;
    setTouched(true);
    if (blockReason) {
      setErrorMessage(blockReason);
      return;
    }
    if (formMessage) return;
    try {
      setBusy(true);
      setErrorMessage(null);
      setDuplicateMessage(null);
      const group = await createVideoGroupEvaluation({
        orderNumber: orderNumber.trim(),
        groupType: resolveGroupType(groupType),
        subjectName: subjectName.trim(),
        sourceRuns: selected,
      });
      navigate(`/video-groups/${group.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("videoGroups.createFailed");
      if (message.includes("มีแบบประเมินกลุ่มนี้อยู่แล้ว")) setDuplicateMessage(message);
      else {
        reportError(error, { source: "popup", context: { action: "create_group", sourceCount: selected.length } });
        setErrorPopup(message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
      <ErrorNoticeModal isOpen={loadErrorPopup !== null} detail={loadErrorPopup} onClose={() => setLoadErrorPopup(null)} />
      <ErrorNoticeModal isOpen={errorPopup !== null} detail={errorPopup} onClose={() => setErrorPopup(null)} />
      <main className="mx-auto max-w-5xl px-4 py-6 md:py-8">
        <section className="ui-hover-card mb-6 rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{t("videoGroups.title")}</h2>
              <p className="mt-1 text-xs text-slate-500">{t("videoGroups.subtitle")}</p>
            </div>
            <Link to="/video-groups" className="btn-primary text-center">
              {t("videoGroups.backToList")}
            </Link>
          </div>
        </section>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {errorMessage}
          </div>
        )}

        <form
          noValidate
          aria-busy={busy}
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          <section className={cardClass}>
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                1
              </span>
              <h3 className="text-sm font-semibold text-slate-900 md:text-base">{t("videoGroups.step1")}</h3>
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1 space-y-1">
                <label htmlFor="group-order-number" className="text-xs font-medium text-slate-700">
                  {t("videoGroups.orderNumber")} <span className="text-red-500">*</span>
                </label>
                <input
                  id="group-order-number"
                  type="text"
                  value={orderNumber}
                  disabled={busy}
                  placeholder={t("form.orderPlaceholder")}
                  onChange={(event) => { setOrderNumber(event.target.value); setDuplicateMessage(null); }}
                  className={inputClass}
                />
              </div>
              <div className="flex-1 space-y-1">
                <label htmlFor="group-type" className="text-xs font-medium text-slate-700">
                  {t("videoGroups.groupType")} <span className="text-red-500">*</span>
                </label>
                <input
                  id="group-type"
                  type="text"
                  list="group-type-options"
                  value={groupType}
                  disabled={busy}
                  maxLength={GROUP_TYPE_MAX_LENGTH}
                  autoComplete="off"
                  placeholder={t("videoGroups.groupTypePlaceholder")}
                  onChange={(event) => { setGroupType(event.target.value); setDuplicateMessage(null); }}
                  className={inputClass}
                />
                <datalist id="group-type-options">
                  {GROUP_TYPES.map((type) => (
                    <option key={type.value} value={type.label} />
                  ))}
                </datalist>
              </div>
              <div className="flex-1 space-y-1">
                <label htmlFor="group-subject-name" className="text-xs font-medium text-slate-700">
                  {t("videoGroups.subjectName")} <span className="text-red-500">*</span>
                </label>
                <input
                  id="group-subject-name"
                  type="text"
                  value={subjectName}
                  disabled={busy}
                  placeholder={t("form.subjectPlaceholder")}
                  onChange={(event) => { setSubjectName(event.target.value); setDuplicateMessage(null); }}
                  className={inputClass}
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">{t("videoGroups.groupTypeHint")}</p>
            {touched && formMessage && <p className="text-xs font-medium text-red-600">{formMessage}</p>}
            {duplicateMessage && <p className="text-xs font-medium text-red-600" role="alert">{duplicateMessage}</p>}
          </section>

          <section className={cardClass}>
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                2
              </span>
              <h3 className="text-sm font-semibold text-slate-900 md:text-base">{t("videoGroups.step2")}</h3>
            </div>
            <label className="block text-xs font-medium text-slate-700">
              {t("videoGroups.searchLabel")}
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("videoGroups.searchPlaceholder")}
                className={`${inputClass} mt-1`}
              />
            </label>
            {loading ? (
              <p className="text-sm text-slate-500" role="status">{t("videoGroups.loading")}</p>
            ) : filtered.length === 0 && search.trim() ? (
              <p className="text-sm text-slate-500">{t("videoGroups.noMatch")}</p>
            ) : (
              <CaseEvaluationPicker
                analyses={filtered}
                selectedIds={selectedIds}
                onChange={setSelectedIds}
                blockReason={blockReason}
                selectedCount={selected.length}
                disabled={busy}
              />
            )}
          </section>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              className="btn-secondary rounded-full px-6 py-2 text-base"
              disabled={busy}
              onClick={() => navigate("/video-groups")}
            >
              {t("common.back")}
            </button>
            <button type="submit" className="btn-primary rounded-full px-6 py-2 text-base shadow-md" disabled={busy}>
              {busy ? t("videoGroups.creating") : t("form.submit")}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
