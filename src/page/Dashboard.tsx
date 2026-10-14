import { queueStatusLabel } from "../services/queueStatus";
import RequestQueuePanel from "../components/RequestQueuePanel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildDashboardModel, buildDashboardStats, loadDashboardData, type DashboardData } from "../services/dashboardService";
import { Link, useNavigate } from "react-router-dom";

import { accountingService } from "../services/accountingService";
import MainNavbar from "../components/MainNavbar";
import { getSections } from "../config/sections";
import { useAuthRole } from "../hooks/useAuthRole";
import { useLanguage } from "../i18n/useLanguage";

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
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
        <MainNavbar />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-lg text-gray-600 dark:text-gray-400">{t("common.loading")}</div>
        </div>
      </div>
    );
  }

  const activeSectionData = stats.find((section) => section.id === activeTab);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <MainNavbar />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t("dashboard.title")}
          </h1>
          {model && <p className="text-gray-500 dark:text-gray-400">
            {t("dashboard.totalResponses", { count: totalResponses })}
          </p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-secondary" disabled={refreshing} onClick={() => void fetchDashboard()}>
              {refreshing ? (th ? "กำลังอัปเดต..." : "Updating...") : (th ? "รีเฟรชข้อมูล" : "Refresh")}
            </button>
            <Link to="/video-cases" className="btn-secondary">{th ? "จัดการ Video Case" : "Manage video cases"}</Link>
            {updatedAt && <span className="text-xs text-slate-500">{th ? "อัปเดตล่าสุด" : "Last updated"} {updatedAt.toLocaleTimeString()}</span>}
          </div>
        </div>

        {errorMessage && <div role="alert" className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {th ? "โหลดข้อมูล Dashboard ไม่สำเร็จ กรุณากดรีเฟรชเพื่อลองอีกครั้ง" : "Could not load dashboard data. Refresh to try again."}
          {data && <p>{th ? "ข้อมูลด้านล่างเป็นข้อมูลจากการโหลดสำเร็จครั้งล่าสุด" : "Showing the last successfully loaded data."}</p>}
        </div>}

        {model && <>
          <RequestQueuePanel />
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [th ? "Video Case ที่ใช้งาน" : "Active video cases", model.caseCount],
              [th ? "ผลประเมินรายบุคคล" : "Individual evaluations", totalResponses],
              [th ? "ผลรวมการประเมิน" : "Combined summaries", model.summaryCount],
              [th ? "รายงานพร้อมเปิด" : "Reports ready", model.readyDocumentCount],
            ].map(([label, count]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">{count}</p>
            </div>)}
          </div>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
            {th ? "แสดงข้อมูลตามสิทธิ์ของคุณ ไม่รวมเคสในถังขยะ กราฟด้านล่างใช้ผลประเมินรายบุคคลโดยไม่นับผลรวมซ้ำ และอัปเดตอัตโนมัติทุก 30 วินาทีขณะเปิดหน้านี้" : "Shows data you can access, excluding trashed cases. Charts use individual evaluations without double-counting summaries. Updates every 30 seconds while visible."}
          </p>
          <section className="mb-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{th ? "ผลวิเคราะห์วิดีโอและรายงาน" : "Video analyses and reports"}</h2>
            <div className="my-4 flex flex-wrap gap-2" role="group" aria-label={th ? "ประเภทผลวิเคราะห์" : "Analysis type"}>
              {(["all", "evaluation", "aggregate"] as const).map(kind => <button key={kind} type="button" aria-pressed={activityKind === kind}
                className={activityKind === kind ? "btn-primary" : "btn-secondary"}
                onClick={() => { setActivityKind(kind); setVisibleCount(8); }}>
                {kind === "all" ? (th ? "ทั้งหมด" : "All") : kind === "evaluation" ? (th ? "รายบุคคล" : "Individual") : (th ? "ผลรวม Video Case" : "Case summaries")}
              </button>)}
            </div>
            {activities.length === 0 ? <p className="py-6 text-sm text-slate-500">{th ? "ยังไม่มีผลวิเคราะห์ประเภทนี้" : "No analyses of this type yet."}</p> : <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"><tr>
                    {(th ? ["วิดีโอ / เคส", "ประเภท", "วันที่", "คะแนนเฉลี่ย", "เอกสาร", "เปิดดู"] : ["Video / case", "Type", "Date", "Average", "Document", "View"]).map(label => <th key={label} className="px-3 py-3 font-medium">{label}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {activities.slice(0, visibleCount).map(row => <tr key={row.id} className="text-slate-700 dark:text-slate-200">
                      <td className="max-w-[260px] break-words px-3 py-3">
                        {row.videoCaseId ? <Link to={`/video-cases/${row.videoCaseId}`} className="font-semibold text-[#04418b] dark:text-sky-300">{row.title}</Link> : <span className="font-semibold">{row.title}</span>}
                        <p className="mt-1 text-xs text-slate-500">{row.id.replace("evaluation-", "#").replace("aggregate-", "")}</p>
                      </td>
                      <td className="px-3 py-3">{row.kind === "aggregate" ? (th ? `ผลรวม ${row.sourceCount} รายการ` : `${row.sourceCount} evaluations combined`) : (th ? "รายบุคคล" : "Individual")}</td>
                      <td className="px-3 py-3">{new Date(row.createdAt).toLocaleString(language === "th" ? "th-TH" : "en-US")}</td>
                      <td className="px-3 py-3 font-semibold">{row.average === null ? "—" : row.average.toFixed(2)}</td>
                      <td className="px-3 py-3">{row.documentPath ? (th ? "พร้อมเปิด" : "Ready") : queueStatusLabel(row.documentStatus, th)}</td>
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
        </>}

        {model && <>
        <div className="mb-8 flex flex-col items-start justify-between gap-6 xl:flex-row">
          <div className="w-full flex-1">
            <span className="mb-2 block text-sm font-medium text-gray-500 dark:text-gray-400">
              {t("dashboard.selectSection")}
            </span>
            <div className="flex flex-wrap gap-2">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveTab(section.id)}
                  className={`ui-hover-button whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${
                    activeTab === section.id
                      ? "bg-[#04418b] text-white shadow-md"
                      : "border border-gray-200 bg-white text-gray-600 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300"
                  }`}
                >
                  {section.title}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-shrink-0">
            <span className="mb-2 block text-sm font-medium text-gray-500 dark:text-gray-400">
              {t("dashboard.chartMode")}
            </span>
            <div className="flex w-full rounded-lg border border-gray-200 bg-white p-1 shadow-sm dark:border-slate-600 dark:bg-slate-800 sm:w-auto">
              <button
                onClick={() => setChartType("bar")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium sm:flex-none ${
                  chartType === "bar"
                    ? "bg-blue-50 text-[#04418b] dark:bg-blue-900/30 dark:text-blue-300"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                <BarChartIcon />
                {t("dashboard.barChart")}
              </button>
              <button
                onClick={() => setChartType("donut")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium sm:flex-none ${
                  chartType === "donut"
                    ? "bg-blue-50 text-[#04418b] dark:bg-blue-900/30 dark:text-blue-300"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                <DonutChartIcon />
                {t("dashboard.donutChart")}
              </button>
            </div>
          </div>
        </div>

        {activeSectionData ? (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between bg-[#04418b] px-6 py-4">
              <h2 className="text-xl font-semibold text-white">
                {activeSectionData.title}
              </h2>
              <span className="text-sm text-white/80">
                {t("dashboard.sectionLabel", { id: activeSectionData.id })}
              </span>
            </div>

            <div className="space-y-10 p-6">
              {activeSectionData.questions.map((question, idx) => (
                <div
                  key={question.id}
                  className="border-b border-slate-300 pb-8 last:border-0 last:pb-0 dark:border-slate-700"
                >
                  <div className="flex flex-col gap-8 md:flex-row">
                    <div className="flex-1 space-y-4">
                      <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">
                        {idx + 1}. {question.label}
                      </h3>

                      {chartType === "bar" ? (
                        <div className="space-y-3 pt-2">
                          {[5, 4, 3, 2, 1].map((score) => {
                            const count = question.scores[score] || 0;
                            const percentage =
                              question.count > 0
                                ? (count / question.count) * 100
                                : 0;

                            return (
                              <div
                                key={score}
                                className="flex items-center gap-3 text-sm"
                              >
                                <span className="w-12 text-right font-medium text-gray-500 dark:text-gray-400">
                                  {score}
                                </span>
                                <div className="group relative h-6 flex-1 overflow-hidden rounded-md bg-gray-100 dark:bg-slate-700">
                                  <div
                                    className="relative flex h-full items-center rounded-md transition-all duration-500"
                                    style={{
                                      width: `${percentage}%`,
                                      backgroundColor: getScoreColor(score),
                                      opacity: percentage > 0 ? 1 : 0.3,
                                    }}
                                  />
                                  {percentage > 0 && (
                                    <div className="absolute inset-0 flex items-center px-2">
                                      <span className="text-[10px] font-bold text-white drop-shadow-sm">
                                        {percentage.toFixed(0)}%
                                      </span>
                                    </div>
                                  )}
                                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                                    <span className="rounded border border-gray-200 bg-white/90 px-2 py-0.5 text-[10px] font-bold text-gray-700 shadow-sm dark:border-slate-600 dark:bg-slate-800/90 dark:text-gray-200">
                                      {count}
                                    </span>
                                  </div>
                                </div>
                                <span className="w-8 text-right font-medium text-gray-600 dark:text-gray-300">
                                  {count}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-8 py-4 sm:flex-row">
                          <div className="relative h-48 w-48">
                            <svg
                              viewBox="0 0 100 100"
                              className="h-full w-full -rotate-90 transform"
                            >
                              {(() => {
                                const radius = 40;
                                const circumference = 2 * Math.PI * radius;
                                let cumulativeLength = 0;

                                return [5, 4, 3, 2, 1].map((score) => {
                                  const count = question.scores[score] || 0;
                                  if (!question.count || count === 0)
                                    return null;

                                  const segmentLength =
                                    (count / question.count) * circumference;
                                  const strokeDasharray = `${segmentLength} ${circumference - segmentLength}`;
                                  const strokeDashoffset = -cumulativeLength;
                                  cumulativeLength += segmentLength;

                                  return (
                                    <circle
                                      key={score}
                                      cx="50"
                                      cy="50"
                                      r={radius}
                                      fill="transparent"
                                      stroke={getScoreColor(score)}
                                      strokeWidth="20"
                                      strokeDasharray={strokeDasharray}
                                      strokeDashoffset={strokeDashoffset}
                                      className="transition-all duration-700 ease-out"
                                    />
                                  );
                                });
                              })()}
                              <circle cx="50" cy="50" r="30" className="fill-white dark:fill-slate-800" />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-3xl font-bold text-gray-800 dark:text-gray-200">
                                {question.average.toFixed(1)}
                              </span>
                              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                {t("dashboard.average")}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-col">
                            {[5, 4, 3, 2, 1].map((score) => {
                              const count = question.scores[score] || 0;
                              const percentage =
                                question.count > 0
                                  ? (count / question.count) * 100
                                  : 0;
                              return (
                                <div
                                  key={score}
                                  className="flex items-center gap-2 text-xs"
                                >
                                  <div
                                    className="h-3 w-3 flex-shrink-0 rounded-full"
                                    style={{
                                      backgroundColor: getScoreColor(score),
                                    }}
                                  />
                                  <span className="min-w-[50px] text-gray-600 dark:text-gray-400">
                                    {score}:
                                  </span>
                                  <span className="font-bold text-gray-800 dark:text-gray-200">
                                    {count}
                                  </span>
                                  <span className="text-gray-400 dark:text-gray-500">
                                    ({percentage.toFixed(0)}%)
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex-shrink-0 rounded-xl border border-slate-300 bg-white p-6 dark:border-slate-600 dark:bg-slate-900 md:w-64">
                      <div className="flex h-full flex-col items-center justify-center">
                        <span className="mb-1 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                          {t("dashboard.scoreAverage")}
                        </span>
                        <div className="my-2 text-5xl font-bold text-[#04418b] dark:text-blue-400">
                          {question.average.toFixed(2)}
                        </div>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {t("dashboard.outOfFive")}
                        </span>
                        <div className="mt-4 h-px w-full bg-slate-300 dark:bg-slate-600" />
                        <div className="mt-4 flex flex-col items-center">
                          <span className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                            {question.count}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {t("dashboard.respondents")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white py-16 text-center shadow dark:border-slate-700 dark:bg-slate-800">
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
              {t("dashboard.noData")}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t("dashboard.noDataDesc")}
            </p>
          </div>
        )}
        </>}
      </div>
    </div>
  );
}

function getScoreColor(score: number): string {
  switch (score) {
    case 5:
      return "#4285F4";
    case 4:
      return "#34A853";
    case 3:
      return "#FBBC05";
    case 2:
      return "#FA7B17";
    case 1:
      return "#EA4335";
    default:
      return "#9AA0A6";
  }
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
