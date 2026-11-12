import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import CaseEvaluationPicker from "../components/CaseEvaluationPicker";
import MainNavbar from "../components/MainNavbar";
import { getSections } from "../config/sections";
import { useLanguage } from "../i18n/useLanguage";
import { combineAggregateStatistics } from "../services/aggregateStatistics.js";
import {
  getCombineBlockReason,
  keepCombinableSelection,
  toCombineSourceRuns,
} from "../services/videoCaseCombineSelectionCore.js";
import { GROUP_TYPES, validateVideoGroupForm } from "../services/videoGroupCore.js";
import {
  createVideoGroupEvaluation,
  getSelectableEvaluations,
  type SelectableEvaluationRow,
  type VideoGroupType,
} from "../services/videoGroupService";

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#04418b] focus:outline-none";

export default function VideoGroupCreatePage() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [searchParams] = useSearchParams();
  const requestedCaseId = searchParams.get("caseId")?.trim() || "";

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [evaluations, setEvaluations] = useState<SelectableEvaluationRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [groupType, setGroupType] = useState<VideoGroupType | "">("");
  const [subjectName, setSubjectName] = useState("");
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
        if (requestedCaseId) {
          setSelectedIds(rows.filter((row) => row.video_case_id === requestedCaseId).map((row) => row.id));
        }
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : t("videoGroups.loadFailed"));
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
  const sections = useMemo(() => getSections(language), [language]);
  const sectionAverages = useMemo(
    () => (selected.length > 0 ? combineAggregateStatistics(toCombineSourceRuns(selected)).sectionAverages : {}) as Record<string, number>,
    [selected],
  );
  const averageRows = sections.filter((section) => typeof sectionAverages[section.id] === "number");
  const blocked = blockReason !== null;

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
        groupType: groupType as VideoGroupType,
        subjectName: subjectName.trim(),
        sourceRuns: selected,
      });
      navigate(`/video-groups/${group.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("videoGroups.createFailed");
      if (message.includes("มีแบบประเมินกลุ่มนี้อยู่แล้ว")) setDuplicateMessage(message);
      else setErrorMessage(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
      <main className="mx-auto max-w-4xl px-4 py-6 md:py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">{t("videoGroups.title")}</h2>
          <p className="mt-1 text-sm text-slate-500">{t("videoGroups.subtitle")}</p>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
        )}

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">{t("videoGroups.step1")}</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium text-slate-700">
              {t("videoGroups.orderNumber")}
              <input
                type="text"
                value={orderNumber}
                disabled={busy}
                onChange={(event) => { setOrderNumber(event.target.value); setDuplicateMessage(null); }}
                className={inputClass}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              {t("videoGroups.groupType")}
              <select
                value={groupType}
                disabled={busy}
                onChange={(event) => { setGroupType(event.target.value as VideoGroupType | ""); setDuplicateMessage(null); }}
                className={inputClass}
              >
                <option value="" disabled>-</option>
                {GROUP_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              {t("videoGroups.subjectName")}
              <input
                type="text"
                value={subjectName}
                disabled={busy}
                onChange={(event) => { setSubjectName(event.target.value); setDuplicateMessage(null); }}
                className={inputClass}
              />
            </label>
          </div>
          {touched && formMessage && <p className="mt-3 text-sm text-amber-700">{formMessage}</p>}
          {duplicateMessage && <p className="mt-3 text-sm text-red-700" role="alert">{duplicateMessage}</p>}
        </section>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">{t("videoGroups.step2")}</h3>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            {t("videoGroups.searchLabel")}
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("videoGroups.searchPlaceholder")}
              className={inputClass}
            />
          </label>
          <div className="mt-4">
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
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">{t("videoGroups.step3")}</h3>
          <p className="mt-2 text-sm font-semibold text-slate-800">
            {t("videoGroups.sectionAverages", { count: selected.length })}
          </p>
          {averageRows.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{t("videoGroups.noAverages")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
              {averageRows.map((section) => (
                <li key={section.id} className="flex items-center justify-between gap-3 bg-white px-4 py-3 text-sm">
                  <span className="min-w-0 break-words text-slate-800">{section.title}</span>
                  <span className="shrink-0 text-base font-bold text-[#04418b]">{sectionAverages[section.id].toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
          {blockReason && <p className="mt-3 text-sm text-amber-700">{blockReason}</p>}
          <div className="mt-4">
            <button type="button" className="btn-primary" disabled={busy || blocked} onClick={() => void handleCreate()}>
              {busy ? t("videoGroups.creating") : t("videoGroups.create")}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
