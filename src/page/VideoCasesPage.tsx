import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import CaseEvaluationPicker from "../components/CaseEvaluationPicker";
import ConfirmModal from "../components/ConfirmModal";
import MainNavbar from "../components/MainNavbar";
import VideoCaseEditor from "../components/VideoCaseEditor";
import { buildVideoCaseSummaryDocumentPreviewPath } from "../services/videoCaseSummaryDocumentPreviewCore.js";
import {
  getCombinableEvaluationIds,
  getCombineBlockReason,
  keepCombinableSelection,
  toCombineSourceRuns,
} from "../services/videoCaseCombineSelectionCore.js";
import { normalizeRole, type AppRole } from "../lib/roles";
import { supabase } from "../lib/supabaseClient";
import {
  combineVideoCaseAnalyses,
  getMyVideoCases,
  getVideoCaseAggregates,
  getVideoCaseAnalyses,
  getVideoCaseMembership,
  setVideoCaseTrashed,
  type VideoCaseAggregateRow,
  type VideoCaseEvaluationRow,
  type VideoCaseMemberRole,
  type VideoCaseRow,
} from "../services/videoCaseService";

export default function VideoCasesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedCaseId = searchParams.get("caseId")?.trim() || "";
  const [loading, setLoading] = useState(true);
  const [appRole, setAppRole] = useState<AppRole>("user");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingCase, setEditingCase] = useState<VideoCaseRow | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [caseToTrash, setCaseToTrash] = useState<VideoCaseRow | null>(null);
  const [changingTrash, setChangingTrash] = useState(false);
  const trashBusy = useRef(false);
  const listRequest = useRef(0);
  const detailsRequest = useRef(0);
  const [cases, setCases] = useState<VideoCaseRow[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<VideoCaseMemberRole | null>(null);
  const [analyses, setAnalyses] = useState<VideoCaseEvaluationRow[]>([]);
  const [aggregates, setAggregates] = useState<VideoCaseAggregateRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [combining, setCombining] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedAnalysisIds, setSelectedAnalysisIds] = useState<number[]>([]);

  // On phones the selected-case card sits far above the list, so bring it into view.
  const selectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    if (window.matchMedia("(max-width: 767px)").matches) {
      document.getElementById("selected-video-case")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const selectedCase = useMemo(
    () => cases.find((item) => item.id === selectedCaseId) ?? null,
    [cases, selectedCaseId],
  );

  const effectiveCaseRole: VideoCaseMemberRole =
    appRole === "admin" ? "leader" : (selectedRole ?? "member");
  const selectedAnalyses = useMemo(() => {
    const combinableIds = keepCombinableSelection(analyses, selectedAnalysisIds);
    return analyses.filter((run) => combinableIds.includes(run.id));
  }, [analyses, selectedAnalysisIds]);
  const combineBlockReason = getCombineBlockReason(analyses, selectedAnalysisIds);
  const canCombine = effectiveCaseRole === "leader" && !showTrash;

  const loadCases = useCallback(async () => {
    const request = ++listRequest.current;
    try {
      setLoading(true);
      setErrorMessage(null);
      const data = await getMyVideoCases({ trashed: showTrash });
      if (request !== listRequest.current) return;
      setCases(data);
      if (requestedCaseId && data.some((item) => item.id === requestedCaseId)) {
        setSelectedCaseId(requestedCaseId);
        return;
      }
      setSelectedCaseId((previous) => data.some((item) => item.id === previous) ? previous : data[0]?.id || "");
    } catch (error) {
      if (request === listRequest.current) setErrorMessage(error instanceof Error ? error.message : "Failed to load video cases.");
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [requestedCaseId, showTrash]);

  const loadCaseData = useCallback(async (videoCaseId: string) => {
    const request = ++detailsRequest.current;
    setAnalyses([]);
    setAggregates([]);
    setSelectedRole(null);
    try {
      const [membership, analysisRows, aggregateRows] = await Promise.all([
        getVideoCaseMembership(videoCaseId),
        getVideoCaseAnalyses(videoCaseId),
        getVideoCaseAggregates(videoCaseId),
      ]);

      if (request !== detailsRequest.current) return;
      setSelectedRole(membership?.member_role ?? null);
      setAnalyses(analysisRows);
      setAggregates(aggregateRows);
      setSelectedAnalysisIds(getCombinableEvaluationIds(analysisRows));
    } catch (error) {
      if (request === detailsRequest.current) setErrorMessage(error instanceof Error ? error.message : "Failed to load case details.");
    }
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
    void loadCases();
    const activeRequest = listRequest;
    return () => { activeRequest.current++; };
  }, [loadCases]);

  useEffect(() => {
    if (!selectedCaseId && cases[0]?.id) {
      setSelectedCaseId(cases[0].id);
    }
  }, [cases, selectedCaseId]);

  useEffect(() => {
    if (!selectedCaseId) {
      detailsRequest.current++;
      setAnalyses([]);
      setAggregates([]);
      setSelectedRole(null);
      setSelectedAnalysisIds([]);
      return;
    }

    void loadCaseData(selectedCaseId);
    const activeRequest = detailsRequest;
    return () => { activeRequest.current++; };
  }, [loadCaseData, selectedCaseId]);

  function switchCaseList(trashed: boolean) {
    if (trashBusy.current || trashed === showTrash) return;
    listRequest.current++;
    detailsRequest.current++;
    setCases([]);
    setSelectedCaseId("");
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowTrash(trashed);
  }

  async function handleTrashChange(videoCase: VideoCaseRow, trashed: boolean) {
    if (trashBusy.current) return;
    trashBusy.current = true;
    setChangingTrash(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await setVideoCaseTrashed(videoCase.id, trashed);
      setCases((previous) => previous.filter((item) => item.id !== videoCase.id));
      setSelectedCaseId((previous) => previous === videoCase.id ? "" : previous);
      setSuccessMessage(trashed ? "ย้ายเคสเข้าถังขยะแล้ว ผลประเมินและรายงานเดิมยังอยู่ สามารถกู้คืนได้" : "กู้คืนเคสแล้ว ดูได้ในแท็บเคสที่ใช้งาน");
      setCaseToTrash(null);
    } catch (error) {
      setCaseToTrash(null);
      setErrorMessage(error instanceof Error ? error.message : "เปลี่ยนสถานะเคสไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      trashBusy.current = false;
      setChangingTrash(false);
    }
  }

  async function handleCombine() {
    if (!selectedCase) {
      setErrorMessage("กรุณาเลือกเคสก่อน");
      setConfirmOpen(false);
      return;
    }

    if (combineBlockReason) {
      setErrorMessage(combineBlockReason);
      setConfirmOpen(false);
      return;
    }

    try {
      setCombining(true);
      setErrorMessage(null);
      const aggregate = await combineVideoCaseAnalyses({
        videoCaseId: selectedCase.id,
        caseTitle: selectedCase.case_title || selectedCase.case_key,
        sourceRuns: toCombineSourceRuns(selectedAnalyses),
      });

      navigate(`/video-cases/${selectedCase.id}/summaries/${aggregate.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "รวมผลแบบประเมินไม่สำเร็จ");
    } finally {
      setCombining(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
      <ConfirmModal
        isOpen={Boolean(caseToTrash)}
        title="ย้ายเคสเข้าถังขยะ"
        message={`ย้ายเคส “${caseToTrash?.case_title || caseToTrash?.case_key || ""}” (${caseToTrash?.case_key || ""}) เข้าถังขยะหรือไม่? ผลประเมิน รายงาน และวิดีโอเดิมจะถูกเก็บไว้ และสามารถกู้คืนได้`}
        onCancel={() => { if (!trashBusy.current) setCaseToTrash(null); }}
        onConfirm={() => { if (caseToTrash) void handleTrashChange(caseToTrash, true); }}
        confirmLabel="ย้ายเข้าถังขยะ" cancelLabel="ยกเลิก" confirmDisabled={changingTrash}
      />
      {editingCase && (
        <VideoCaseEditor key={editingCase.id} videoCase={editingCase}
          onCancel={() => setEditingCase(null)}
          onSaved={(updated) => {
            setCases((previous) => previous.map((item) => item.id === updated.id ? updated : item));
            setEditingCase(null);
            setErrorMessage(null);
            setSuccessMessage("บันทึกข้อมูลเคสเรียบร้อยแล้ว");
          }}
        />
      )}
      <ConfirmModal
        isOpen={confirmOpen}
        title="รวมผลและวิเคราะห์ใหม่"
        message={`รวมแบบประเมิน ${selectedAnalyses.length} รายการที่เลือกเป็นแบบประเมินกลุ่มวิดีโอ แล้วตรวจและส่งให้ AI สรุปในหน้าถัดไป`}
        variant="primary"
        onCancel={() => {
          if (!combining) setConfirmOpen(false);
        }}
        onConfirm={() => void handleCombine()}
        confirmLabel="รวมผล"
        cancelLabel="ยกเลิก"
        confirmDisabled={combining}
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

        <div className="mb-4 flex gap-2" role="group" aria-label="รายการ Video Case">
          <button type="button" aria-pressed={!showTrash} disabled={changingTrash} className={!showTrash ? "btn-primary" : "btn-secondary"} onClick={() => switchCaseList(false)}>เคสที่ใช้งาน</button>
          <button type="button" aria-pressed={showTrash} disabled={changingTrash} className={showTrash ? "btn-primary" : "btn-secondary"} onClick={() => switchCaseList(true)}>ถังขยะ</button>
        </div>
        {showTrash && <p className="mb-4 text-sm text-slate-500">เคสในถังขยะยังเก็บผลประเมิน รายงาน และวิดีโอไว้ ผู้สร้างเคสหรือแอดมินสามารถกู้คืนเพื่อใช้งานต่อได้</p>}
        <section id="selected-video-case" className="mb-6 scroll-mt-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-5 p-5 md:flex-row md:items-start md:justify-between md:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#04418b]">เคสที่เลือก</p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">
                {selectedCase?.case_title || selectedCase?.case_key || "ยังไม่ได้เลือกเคส"}
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                {selectedCase ? `รหัสเคส: ${selectedCase.case_key}` : "เลือกเคสด้านล่างเพื่อดูแบบประเมินและผลรวม"}
              </p>
              {selectedCase && (
                <p className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  บทบาทของคุณ: {effectiveCaseRole === "leader" ? "หัวหน้าเคส" : "สมาชิก"}{appRole === "admin" ? " (ผู้ดูแลระบบ)" : ""}
                </p>
              )}
              {selectedCase?.description && (
                <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-600">{selectedCase.description}</p>
              )}
              {selectedCase?.source_file_name && (
                <p className="mt-2 break-all text-sm text-slate-500">วิดีโอ: {selectedCase.source_file_name}</p>
              )}
            </div>
            {selectedCase && !showTrash && (
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                {(appRole === "admin" || selectedCase.created_by === currentUserId) && (
                  <>
                    <button type="button" className="btn-secondary" disabled={changingTrash} onClick={() => setEditingCase(selectedCase)}>แก้ไขเคส</button>
                    <button type="button" className="btn-danger" disabled={changingTrash} onClick={() => setCaseToTrash(selectedCase)}>ย้ายเข้าถังขยะ</button>
                  </>
                )}
                <Link
                  to={`/video-cases/${selectedCase.id}`}
                  className="btn-secondary text-center"
                >
                  ดูรายละเอียด
                </Link>
                <Link
                  to={`/form-submit?caseId=${selectedCase.id}`}
                  className="btn-primary text-center"
                >
                  กรอกแบบประเมิน
                </Link>
              </div>
            )}
            {selectedCase && showTrash && (appRole === "admin" || selectedCase.created_by === currentUserId) && (
              <button type="button" className="btn-primary" disabled={changingTrash} onClick={() => void handleTrashChange(selectedCase, false)}>{changingTrash ? "กำลังกู้คืน..." : "กู้คืนเคส"}</button>
            )}
          </div>
          {selectedCase && canCombine && (
            <div className="border-t border-slate-200 p-5 md:p-6">
              <CaseEvaluationPicker
                analyses={analyses}
                selectedIds={selectedAnalysisIds}
                onChange={setSelectedAnalysisIds}
                disabled={combining}
              />
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={combining || combineBlockReason !== null}
                  onClick={() => setConfirmOpen(true)}
                >
                  {combining ? "กำลังรวมผล..." : "รวมเป็นแบบประเมินกลุ่ม"}
                </button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 border-t border-slate-200">
            <div className="border-r border-slate-200 p-3 sm:p-4">
              <p className="text-xs font-medium text-slate-500">แบบประเมิน</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{analyses.length}</p>
            </div>
            <div className="border-r border-slate-200 p-3 sm:p-4">
              <p className="text-xs font-medium text-slate-500">ผู้ประเมิน</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {new Set(analyses.map((analysis) => analysis.user_id).filter(Boolean)).size}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs font-medium text-slate-500">ผลรวมล่าสุด</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {aggregates[0] ? ({ pending: "กำลังดำเนินการ", ready: "พร้อมใช้งาน", failed: "ไม่สำเร็จ" }[aggregates[0].status] ?? aggregates[0].status) : "ยังไม่มี"}
              </p>
              {selectedCase && !showTrash && aggregates[0]?.document_status === "ready" && (aggregates[0].pdf_storage_path || aggregates[0].docx_storage_path) && (
                <Link
                  to={buildVideoCaseSummaryDocumentPreviewPath(selectedCase.id, aggregates[0].id)}
                  className="btn-primary mt-2 inline-flex text-xs"
                >
                  เปิดไฟล์รวม PDF / DOCX
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{showTrash ? "เคสในถังขยะ" : "รายการ Video Case"}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {showTrash ? "เลือกเคสที่ต้องการกู้คืน" : "เลือกเคสเพื่อดูผลประเมิน แก้ไขข้อมูล หรือย้ายเข้าถังขยะ"}
              </p>
            </div>
            <p className="text-xs font-medium text-slate-500">{cases.length} เคส</p>
          </div>

          {loading ? <p className="mt-4 text-sm text-slate-500" role="status">กำลังโหลดเคส...</p> : cases.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">{showTrash ? "ไม่มีเคสในถังขยะ" : "ยังไม่มีเคสที่ใช้งาน"}</p>
          ) : (
            <>
            <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 md:hidden">
              {cases.map((videoCase) => {
                const isSelected = videoCase.id === selectedCaseId;
                return (
                  <li key={videoCase.id}>
                    <button
                      type="button"
                      onClick={() => selectCase(videoCase.id)}
                      aria-pressed={isSelected}
                      className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left ${isSelected ? "bg-blue-50" : "bg-white"}`}
                    >
                      <span className="min-w-0">
                        <span className="block break-words font-semibold text-slate-900">{videoCase.case_title || "ไม่มีชื่อเคส"}</span>
                        <span className="mt-1 block break-all text-xs text-slate-500">{videoCase.case_key}</span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {new Date((showTrash && videoCase.deleted_at) || videoCase.updated_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${isSelected ? "border-[#04418b] bg-[#04418b] text-white" : "border-slate-300 text-slate-700"}`}>
                        {isSelected ? "เลือกอยู่" : "เลือก"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 font-medium text-slate-500">รหัสเคส</th>
                      <th className="px-4 py-3 font-medium text-slate-500">ชื่อเคส</th>
                      <th className="px-4 py-3 font-medium text-slate-500">ไฟล์วิดีโอ</th>
                      <th className="px-4 py-3 font-medium text-slate-500">{showTrash ? "ย้ายเข้าถังขยะเมื่อ" : "แก้ไขล่าสุด"}</th>
                      <th className="px-4 py-3 font-medium text-slate-500">เลือก</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {cases.map((videoCase) => {
                      const isSelected = videoCase.id === selectedCaseId;
                      return (
                        <tr
                          key={videoCase.id}
                          className={isSelected ? "bg-blue-50" : "hover:bg-slate-50"}
                        >
                          <td className="px-4 py-4 align-top">
                            <button
                              type="button"
                              onClick={() => selectCase(videoCase.id)}
                              className="text-left"
                            >
                              <p className="break-all text-xs font-medium text-[#04418b]">
                                {videoCase.case_key}
                              </p>
                            </button>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <button
                              type="button"
                              onClick={() => selectCase(videoCase.id)}
                              className="text-left font-semibold text-slate-900 hover:text-[#04418b]"
                            >
                              {videoCase.case_title || "ไม่มีชื่อเคส"}
                            </button>
                          </td>
                          <td className="px-4 py-4 align-top text-slate-600">
                            {videoCase.source_file_name || "ไม่มีไฟล์วิดีโอ"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 align-top text-slate-600">
                            {new Date((showTrash && videoCase.deleted_at) || videoCase.updated_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                          </td>
                          <td className="px-4 py-4 align-top">
                            <button
                              type="button"
                              onClick={() => selectCase(videoCase.id)}
                              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                isSelected
                                  ? "border-[#04418b] bg-[#04418b] text-white"
                                  : "border-slate-300 bg-white text-slate-700 hover:border-[#04418b] hover:text-[#04418b]"
                              }`}
                            >
                              {isSelected ? "เลือกอยู่" : "เลือก"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            </>
          )}
        </section>

      </main>
    </div>
  );
}
