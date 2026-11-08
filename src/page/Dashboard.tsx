import { documentStatusLabel } from "../services/documentStatus";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildDashboardModel, buildDashboardStats, loadDashboardData, type DashboardData } from "../services/dashboardService";
import { Link, useNavigate } from "react-router-dom";

import { accountingService } from "../services/accountingService";
import MainNavbar from "../components/MainNavbar";
import { getSections } from "../config/sections";
import { useAuthRole } from "../hooks/useAuthRole";
import { useLanguage } from "../i18n/useLanguage";
import "./dashboard.css";

export default function Dashboard() {
  const navigate = useNavigate();
  const { loading: authLoading, user: authUser } = useAuthRole();
  const { language, t } = useLanguage();
  const th = language === "th";
  const sections = useMemo(() => getSections(language), [language]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [activityKind, setActivityKind] = useState<"all" | "evaluation" | "aggregate">("all");
  const [visibleCount, setVisibleCount] = useState(8);
  const [activeTab, setActiveTab] = useState<string>(sections[0]?.id || "1");
  const [chartType, setChartType] = useState<"bar" | "donut">("bar");
  const controller = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const userId = authUser?.id;
  const model = useMemo(() => data ? buildDashboardModel(data) : null, [data]);
  const stats = useMemo(() => buildDashboardStats(model?.evaluations || [], sections), [model, sections]);
  const totalResponses = model?.evaluations.length || 0;
  const activities = (model?.recent || []).filter(row => activityKind === "all" || row.kind === activityKind);

  const fetchDashboard = useCallback(async () => {
    if (!userId) return;
    controller.current?.abort();
    const currentController = new AbortController();
    controller.current = currentController;
    const version = ++requestVersion.current;
    const timeout = window.setTimeout(() => currentController.abort(), 20_000);
    setRefreshing(true);
    try {
      const loaded = await loadDashboardData(currentController.signal);
      if (version !== requestVersion.current) return;
      setData(loaded);
      setUpdatedAt(new Date());
      setErrorMessage(null);
    } catch (error) {
      if (version !== requestVersion.current) return;
      setErrorMessage(currentController.signal.aborted ? "timeout" : error instanceof Error ? error.message : "Unknown error");
    } finally {
      window.clearTimeout(timeout);
      if (version === requestVersion.current) {
        controller.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) { navigate("/", { replace: true }); return; }
    setData(null);
    setLoading(true);
    void fetchDashboard();
    void accountingService.logActivity({ user_id: userId, action: "dashboard.viewed", resource: "dashboard" }).catch(() => {});
    const refreshVisible = () => {
      if (document.visibilityState === "visible" && !controller.current) void fetchDashboard();
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    const interval = window.setInterval(refreshVisible, 30_000);
    const versionRef = requestVersion;
    return () => {
      versionRef.current++;
      controller.current?.abort();
      controller.current = null;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [authLoading, userId, fetchDashboard, navigate]);
  if (loading) {
    return (
      <div className="db-root">
        <MainNavbar />
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="db-muted text-lg" role="status">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  const activeSectionData = stats.find((section) => section.id === activeTab);
  const overview = stats.map((section, index) => {
    const rated = section.questions.filter((question) => question.count > 0);
    return {
      id: section.id,
      title: section.title,
      index,
      average: rated.length ? rated.reduce((sum, question) => sum + question.average, 0) / rated.length : null,
    };
  });
  const dateLocale = language === "th" ? "th-TH" : "en-US";
  const kpis: [string, number][] = model ? [
    [th ? "Video Case ที่ใช้งาน" : "Active video cases", model.caseCount],
    [th ? "ผลประเมินรายบุคคล" : "Individual evaluations", totalResponses],
    [th ? "ผลรวมการประเมิน" : "Combined summaries", model.summaryCount],
    [th ? "รายงานพร้อมเปิด" : "Reports ready", model.readyDocumentCount],
  ] : [];

  return (
    <div className="db-root">
      <MainNavbar />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-bold leading-snug">{t("dashboard.title")}</h1>
            {model && <p className="db-muted">{t("dashboard.totalResponses", { count: totalResponses })}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {updatedAt && <span className="db-muted text-xs">{th ? "อัปเดตล่าสุด" : "Last updated"} {updatedAt.toLocaleTimeString()}</span>}
            <button type="button" className="btn-secondary" disabled={refreshing} onClick={() => void fetchDashboard()}>
              {refreshing ? (th ? "กำลังอัปเดต..." : "Updating...") : (th ? "รีเฟรชข้อมูล" : "Refresh")}
            </button>
            <Link to="/video-cases" className="btn-primary">{th ? "จัดการ Video Case" : "Manage video cases"}</Link>
          </div>
        </header>

        {errorMessage && <div role="alert" className="db-alert mb-6">
          {th ? "โหลดข้อมูล Dashboard ไม่สำเร็จ กรุณากดรีเฟรชเพื่อลองอีกครั้ง" : "Could not load dashboard data. Refresh to try again."}
          {data && <p>{th ? "ข้อมูลด้านล่างเป็นข้อมูลจากการโหลดสำเร็จครั้งล่าสุด" : "Showing the last successfully loaded data."}</p>}
        </div>}

        {model && <>
          <dl className="db-kpis mb-3">
            {kpis.map(([label, count]) => <div key={label} className="db-kpi">
              <dt className="db-muted text-sm">{label}</dt>
              <dd>{count}</dd>
            </div>)}
          </dl>
          <p className="db-muted mb-8 max-w-3xl text-sm">
            {th ? "แสดงข้อมูลตามสิทธิ์ของคุณ ไม่รวมเคสในถังขยะ กราฟด้านล่างใช้ผลประเมินรายบุคคลโดยไม่นับผลรวมซ้ำ และอัปเดตอัตโนมัติทุก 30 วินาทีขณะเปิดหน้านี้" : "Shows data you can access, excluding trashed cases. Charts use individual evaluations without double-counting summaries. Updates every 30 seconds while visible."}
          </p>

          <section className="db-panel mb-10 p-4 sm:p-6">
            <h2 className="text-xl font-bold leading-snug">{th ? "ผลวิเคราะห์วิดีโอและรายงาน" : "Video analyses and reports"}</h2>
            <div className="my-4 flex flex-wrap gap-2" role="group" aria-label={th ? "ประเภทผลวิเคราะห์" : "Analysis type"}>
              {(["all", "evaluation", "aggregate"] as const).map(kind => <button key={kind} type="button" aria-pressed={activityKind === kind}
                className="db-tab"
                onClick={() => { setActivityKind(kind); setVisibleCount(8); }}>
                {kind === "all" ? (th ? "ทั้งหมด" : "All") : kind === "evaluation" ? (th ? "รายบุคคล" : "Individual") : (th ? "ผลรวม Video Case" : "Case summaries")}
              </button>)}
            </div>
            {activities.length === 0 ? <p className="db-muted py-6 text-sm">{th ? "ยังไม่มีผลวิเคราะห์ประเภทนี้ ส่งแบบประเมินจากหน้า Video Case เพื่อเริ่มต้น" : "No analyses of this type yet. Submit an evaluation from a video case to start."}</p> : <>
              <ul className="md:hidden">
                {activities.slice(0, visibleCount).map(row => <li key={row.id} className="border-t py-3 text-sm" style={{ borderColor: "var(--db-line)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {row.videoCaseId ? <Link to={`/video-cases/${row.videoCaseId}`} className="db-link break-words">{row.title}</Link> : <span className="break-words font-semibold">{row.title}</span>}
                      <p className="db-muted mt-1 text-xs">
                        {row.kind === "aggregate" ? (th ? `ผลรวม ${row.sourceCount} รายการ` : `${row.sourceCount} combined`) : `${th ? "รายบุคคล" : "Individual"} ${row.id.replace("evaluation-", "#")}`}
                        {" · "}{new Date(row.createdAt).toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                    <span className="shrink-0 text-lg font-bold tabular-nums">{row.average === null ? "—" : row.average.toFixed(2)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="db-muted text-xs">{row.documentPath ? (th ? "พร้อมเปิด" : "Ready") : documentStatusLabel(row.documentStatus, th, row.createdAt)}</span>
                    <div className="flex gap-2">
                      <Link to={row.resultPath} className="btn-secondary whitespace-nowrap text-xs">{th ? "ดูผล" : "View result"}</Link>
                      {row.documentPath && <Link to={row.documentPath} className="btn-primary whitespace-nowrap text-xs">PDF / DOCX</Link>}
                    </div>
                  </div>
                </li>)}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="db-table w-full min-w-[700px] text-left text-sm">
                  <thead><tr>
                    {(th ? ["วิดีโอ / เคส", "ประเภท", "วันที่", "คะแนนเฉลี่ย", "เอกสาร", "เปิดดู"] : ["Video / case", "Type", "Date", "Average", "Document", "View"]).map(label => <th key={label} className="px-3 py-3">{label}</th>)}
                  </tr></thead>
                  <tbody>
                    {activities.slice(0, visibleCount).map(row => <tr key={row.id}>
                      <td className="max-w-[260px] break-words px-3 py-3">
                        {row.videoCaseId ? <Link to={`/video-cases/${row.videoCaseId}`} className="db-link">{row.title}</Link> : <span className="font-semibold">{row.title}</span>}
                        <p className="db-muted mt-1 text-xs">{row.id.replace("evaluation-", "#").replace("aggregate-", "")}</p>
                      </td>
                      <td className="px-3 py-3">{row.kind === "aggregate" ? (th ? `ผลรวม ${row.sourceCount} รายการ` : `${row.sourceCount} evaluations combined`) : (th ? "รายบุคคล" : "Individual")}</td>
                      <td className="px-3 py-3">{new Date(row.createdAt).toLocaleString(dateLocale)}</td>
                      <td className="px-3 py-3 font-semibold tabular-nums">{row.average === null ? "—" : row.average.toFixed(2)}</td>
                      <td className="px-3 py-3">{row.documentPath ? (th ? "พร้อมเปิด" : "Ready") : documentStatusLabel(row.documentStatus, th, row.createdAt)}</td>
                      <td className="px-3 py-3"><div className="flex flex-wrap gap-2">
                        <Link to={row.resultPath} className="btn-secondary whitespace-nowrap text-xs">{th ? "ดูผล" : "View result"}</Link>
                        {row.documentPath && <Link to={row.documentPath} className="btn-primary whitespace-nowrap text-xs">PDF / DOCX</Link>}
                      </div></td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
              {activities.length > visibleCount && <button type="button" className="btn-secondary mt-4" onClick={() => setVisibleCount(count => count + 8)}>{th ? "แสดงเพิ่มเติม" : "Show more"}</button>}
            </>}
          </section>

          <section aria-labelledby="overview-heading" className="db-stage mb-8">
            <div className="mb-5 flex flex-col justify-between gap-1 sm:flex-row sm:items-baseline">
              <h2 id="overview-heading" className="text-xl font-bold leading-snug">{th ? "ภาพรวมรายหมวด" : "Overview by category"}</h2>
              <p className="db-stage-muted text-sm">{th ? "คะแนนเฉลี่ย 1–5 กดหมวดเพื่อดูรายข้อ" : "Average score 1–5. Select a category to see each question."}</p>
            </div>
            <div className="db-o-ruler" aria-hidden="true">
              {SCORES.map((score) => <span key={score} style={{ left: `${((score - 1) / 4) * 100}%` }}>{score}</span>)}
            </div>
            <div className="db-o-rows" role="group" aria-label={th ? "เลือกหมวดประเมิน" : "Select a category"}>
              {overview.map((row) => (
                <button key={row.id} type="button" aria-pressed={activeTab === row.id} onClick={() => setActiveTab(row.id)} className="db-o-row" style={{ ["--i" as string]: row.index }}>
                  <span className="db-o-n">{row.index + 1}</span>
                  <span className="db-o-title">{row.title}</span>
                  <span className="db-o-track">
                    {row.average !== null && <>
                      <span className="db-o-fill" style={{ width: `${((row.average - 1) / 4) * 100}%` }} />
                      <span className="db-o-mark" style={{ left: `${((row.average - 1) / 4) * 100}%` }} />
                    </>}
                  </span>
                  <span className="db-o-avg">{row.average === null ? "—" : row.average.toFixed(2)}</span>
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="detail-heading">
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <h2 id="detail-heading" className="text-xl font-bold leading-snug">{activeSectionData ? activeSectionData.title : t("dashboard.noData")}</h2>
                {activeSectionData && <p className="db-muted text-sm">{t("dashboard.sectionLabel", { id: activeSectionData.id })}</p>}
              </div>
              <div className="db-tabs" role="group" aria-label={t("dashboard.chartMode")}>
                <button type="button" aria-pressed={chartType === "bar"} onClick={() => setChartType("bar")} className="db-tab"><BarChartIcon />{t("dashboard.barChart")}</button>
                <button type="button" aria-pressed={chartType === "donut"} onClick={() => setChartType("donut")} className="db-tab"><DonutChartIcon />{t("dashboard.donutChart")}</button>
              </div>
            </div>

            {activeSectionData ? (
              <ol className="grid gap-4 lg:grid-cols-2">
                {activeSectionData.questions.map((question, idx) => (
                  <li key={question.id} className="db-panel p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <h3 className="min-w-0 font-semibold leading-relaxed">{idx + 1}. {question.label}</h3>
                      <div className="shrink-0 text-right">
                        <p className="db-avg">{question.count > 0 ? question.average.toFixed(2) : "—"}</p>
                        <p className="db-muted text-xs">{t("dashboard.outOfFive")}</p>
                      </div>
                    </div>

                    {chartType === "bar" ? (
                      <div className="db-hist" role="img" aria-label={SCORES.map((score) => `${score}: ${question.scores[score] || 0}`).join(", ")}>
                        {SCORES.map((score) => {
                          const count = question.scores[score] || 0;
                          const share = question.count > 0 ? (count / question.count) * 100 : 0;
                          return (
                            <div key={score} className="db-col" title={`${score}: ${count} (${share.toFixed(0)}%)`}>
                              <span className="db-count">{count}</span>
                              <span className="db-bar" style={{ height: `${Math.max(share, count > 0 ? 4 : 0)}%`, background: getScoreColor(score) }} />
                              <span className="db-x">{score}</span>
                            </div>
                          );
                        })}
                        {question.count > 0 && <span className="db-avgline" style={{ left: `${((Math.min(5, Math.max(1, question.average)) - 0.5) / 5) * 100}%` }}><em>{question.average.toFixed(1)}</em></span>}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-5 sm:flex-row">
                        <div className="relative h-36 w-36 shrink-0">
                          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90 transform" aria-hidden="true">
                            {(() => {
                              const radius = 40;
                              const circumference = 2 * Math.PI * radius;
                              let cumulativeLength = 0;
                              return SCORES.map((score) => {
                                const count = question.scores[score] || 0;
                                if (!question.count || count === 0) return null;
                                const segmentLength = (count / question.count) * circumference;
                                const dash = `${segmentLength} ${circumference - segmentLength}`;
                                const offset = -cumulativeLength;
                                cumulativeLength += segmentLength;
                                return <circle key={score} cx="50" cy="50" r={radius} fill="transparent" stroke={getScoreColor(score)} strokeWidth="20" strokeDasharray={dash} strokeDashoffset={offset} />;
                              });
                            })()}
                            <circle cx="50" cy="50" r="30" style={{ fill: "var(--db-surface)" }} />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-2xl font-bold tabular-nums">{question.average.toFixed(1)}</span>
                            <span className="db-muted text-xs">{t("dashboard.average")}</span>
                          </div>
                        </div>
                        <div className="db-legend flex-col !gap-1">
                          {SCORES.map((score) => {
                            const count = question.scores[score] || 0;
                            const percentage = question.count > 0 ? (count / question.count) * 100 : 0;
                            return <span key={score}><i className="db-dot" style={{ background: getScoreColor(score) }} />{score}: <b>{count}</b> ({percentage.toFixed(0)}%)</span>;
                          })}
                        </div>
                      </div>
                    )}

                    <p className="db-muted mt-4 text-sm"><b className="tabular-nums" style={{ color: "var(--db-text)" }}>{question.count}</b> {t("dashboard.respondents")}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="db-panel py-16 text-center">
                <h3 className="text-base font-semibold">{t("dashboard.noData")}</h3>
                <p className="db-muted mt-1 text-sm">{t("dashboard.noDataDesc")}</p>
              </div>
            )}
          </section>
        </>}
      </div>
    </div>
  );
}

const SCORES = [1, 2, 3, 4, 5] as const;

// Colors are CSS variables so light and dark modes can use different ramps.
function getScoreColor(score: number): string {
  return `var(--db-s${score})`;
}

function BarChartIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.25h14" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 16.25v-4.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 16.25V6.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.75 16.25V9.5" />
    </svg>
  );
}

function DonutChartIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="5.75" strokeLinecap="round" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 4.25a5.75 5.75 0 0 1 5.75 5.75H10V4.25Z"
      />
      <circle cx="10" cy="10" r="2.25" />
    </svg>
  );
}
