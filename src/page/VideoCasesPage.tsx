import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import ConfirmModal from "../components/ConfirmModal";
import MainNavbar from "../components/MainNavbar";
import "./dashboard.css";
import VideoCaseEditor from "../components/VideoCaseEditor";
import { buildVideoCaseSummaryDocumentPreviewPath } from "../services/videoCaseSummaryDocumentPreviewCore.js";
import { normalizeRole, type AppRole } from "../lib/roles";
import { supabase } from "../lib/supabaseClient";
import {
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

const PAGE_SIZE = 15;

const formatCaseDate = (value: string) => new Date(value).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function VideoCasesPage() {
  const [searchParams] = useSearchParams();
  const requestedCaseId = searchParams.get("caseId")?.trim() || "";
  const [loading, setLoading] = useState(true);
  const [appRole, setAppRole] = useState<AppRole>("user");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingCase, setEditingCase] = useState<VideoCaseRow | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
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
  const [evaluationCounts, setEvaluationCounts] = useState<Record<string, number>>({});

  // The selected-case box sits above the list, so scroll it back into view when it is off screen.
  const selectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    const box = document.getElementById("selected-video-case");
    if (box && (window.matchMedia("(max-width: 767px)").matches || box.getBoundingClientRect().top < 0)) {
      box.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const selectedCase = useMemo(
    () => cases.find((item) => item.id === selectedCaseId) ?? null,
    [cases, selectedCaseId],
  );

  const effectiveCaseRole: VideoCaseMemberRole =
    appRole === "admin" ? "leader" : (selectedRole ?? "member");

  const loadCases = useCallback(async () => {
    const request = ++listRequest.current;
    try {
      setLoading(true);
      setErrorMessage(null);
      const data = await getMyVideoCases({ trashed: showTrash });
      if (request !== listRequest.current) return;
      setCases(data);
      setEvaluationCounts({});
      if (data.length > 0) {
        void supabase.from("evaluations").select("video_case_id").in("video_case_id", data.map((item) => item.id)).then(({ data: rows, error }) => {
          if (error || request !== listRequest.current) return;
          const counts: Record<string, number> = {};
          for (const row of rows ?? []) {
            const key = String(row.video_case_id);
            counts[key] = (counts[key] ?? 0) + 1;
          }
          setEvaluationCounts(counts);
        });
      }
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
    setSearch("");
    setPage(1);
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
      setSuccessMessage(trashed ? "ย้ายงานประเมินเข้าถังขยะแล้ว แบบประเมินและรายงานเดิมยังอยู่ กู้คืนได้" : "กู้คืนงานประเมินแล้ว ดูได้ในแท็บงานประเมินที่ใช้งาน");
      setCaseToTrash(null);
    } catch (error) {
      setCaseToTrash(null);
      setErrorMessage(error instanceof Error ? error.message : "เปลี่ยนสถานะงานประเมินไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      trashBusy.current = false;
      setChangingTrash(false);
    }
  }

  const searchTerm = search.trim().toLowerCase();
  const filteredCases = searchTerm
    ? cases.filter((item) => [item.case_title, item.case_key, item.source_file_name].some((value) => (value || "").toLowerCase().includes(searchTerm)))
    : cases;
  const pageCount = Math.max(1, Math.ceil(filteredCases.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredCases.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="db-root">
      <MainNavbar />
      <ConfirmModal
        isOpen={Boolean(caseToTrash)}
        title="ย้ายงานประเมินเข้าถังขยะ"
        message={`ย้ายงานประเมิน “${caseToTrash?.case_title || caseToTrash?.case_key || ""}” (${caseToTrash?.case_key || ""}) เข้าถังขยะหรือไม่? ผลประเมิน รายงาน และวิดีโอเดิมจะถูกเก็บไว้ และสามารถกู้คืนได้`}
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
            setSuccessMessage("บันทึกข้อมูลงานประเมินเรียบร้อยแล้ว");
          }}
        />
      )}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-bold leading-snug">จัดการงานประเมิน</h1>
            <p className="db-muted max-w-xl">ดูแบบประเมินรายคนของแต่ละงานประเมิน และให้หัวหน้ารวมเป็นแบบประเมินกลุ่ม</p>
          </div>
          <Link to="/form-submit" className="btn-primary text-center">ไปหน้ากรอกแบบประเมิน</Link>
        </header>

        {errorMessage && <div role="alert" className="db-alert mb-4">{errorMessage}</div>}
        {successMessage && <div role="status" className="db-ok mb-4">{successMessage}</div>}

        <div className="db-tabs mb-4" role="group" aria-label="รายการงานประเมิน">
          <button type="button" aria-pressed={!showTrash} disabled={changingTrash} className="db-tab" onClick={() => switchCaseList(false)}>งานประเมินที่ใช้งาน</button>
          <button type="button" aria-pressed={showTrash} disabled={changingTrash} className="db-tab" onClick={() => switchCaseList(true)}>ถังขยะ</button>
        </div>
        {showTrash && <p className="db-muted mb-4 text-sm">งานประเมินในถังขยะยังเก็บแบบประเมิน รายงาน และวิดีโอไว้ ผู้สร้างหรือแอดมินกู้คืนได้</p>}

        <section id="selected-video-case" className="db-panel mb-8 scroll-mt-20 overflow-hidden">
          <div className="flex flex-col gap-5 p-5 md:flex-row md:items-start md:justify-between md:p-6">
            <div className="min-w-0">
              <p className="db-muted text-sm">งานประเมินที่เลือก</p>
              <h2 className="mt-1 break-words text-2xl font-bold leading-snug">
                {selectedCase?.case_title || selectedCase?.case_key || "ยังไม่ได้เลือกงานประเมิน"}
              </h2>
              <p className="db-muted mt-1 text-sm">
                {selectedCase ? `รหัส ${selectedCase.case_key}` : "เลือกงานประเมินจากรายการด้านล่างเพื่อดูแบบประเมินและแบบประเมินกลุ่ม"}
              </p>
              {selectedCase && (
                <p className="db-state mt-3" data-state={effectiveCaseRole === "leader" ? "ready" : "pending"}>
                  คุณเป็น{effectiveCaseRole === "leader" ? "หัวหน้า" : "สมาชิก"}{appRole === "admin" ? " (ผู้ดูแลระบบ)" : ""}
                </p>
              )}
              {selectedCase?.description && (
                <p className="mt-3 whitespace-pre-wrap break-words text-sm">{selectedCase.description}</p>
              )}
              {selectedCase?.source_file_name && (
                <p className="db-muted mt-2 break-all text-sm">วิดีโอ: {selectedCase.source_file_name}</p>
              )}
            </div>
            {selectedCase && !showTrash && (
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                {(appRole === "admin" || selectedCase.created_by === currentUserId) && (
                  <button type="button" className="btn-secondary" disabled={changingTrash} onClick={() => setEditingCase(selectedCase)}>แก้ไข</button>
                )}
                <Link to={`/video-cases/${selectedCase.id}`} className="btn-secondary text-center">ดูรายละเอียด</Link>
              </div>
            )}
            {selectedCase && showTrash && (appRole === "admin" || selectedCase.created_by === currentUserId) && (
              <button type="button" className="btn-primary" disabled={changingTrash} onClick={() => void handleTrashChange(selectedCase, false)}>{changingTrash ? "กำลังกู้คืน..." : "กู้คืน"}</button>
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
              <dd className="!text-base !font-semibold">
                {aggregates[0] ? ({ pending: "กำลังดำเนินการ", ready: "พร้อมเปิด", failed: "ไม่สำเร็จ" }[aggregates[0].status] ?? aggregates[0].status) : "ยังไม่มี"}
              </dd>
              {selectedCase && !showTrash && aggregates[0]?.document_status === "ready" && (aggregates[0].pdf_storage_path || aggregates[0].docx_storage_path) && (
                <Link to={buildVideoCaseSummaryDocumentPreviewPath(selectedCase.id, aggregates[0].id)} className="btn-primary mt-2 inline-flex text-xs">
                  เปิดไฟล์ PDF / DOCX
                </Link>
              )}
            </div>
          </dl>
          {selectedCase && !showTrash && (appRole === "admin" || selectedCase.created_by === currentUserId) && (
            <div className="flex justify-end border-t px-5 py-2 md:px-6" style={{ borderColor: "var(--db-line)" }}>
              <button type="button" className="db-danger-link" disabled={changingTrash} onClick={() => setCaseToTrash(selectedCase)}>ย้ายเข้าถังขยะ</button>
            </div>
          )}
        </section>

        <section className="db-panel p-4 sm:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold leading-snug">{showTrash ? "งานประเมินในถังขยะ" : "รายการงานประเมิน"}</h2>
              <p className="db-muted mt-1 text-sm">
                {showTrash ? "เลือกงานประเมินที่ต้องการกู้คืน" : "เลือกงานประเมินเพื่อดูแบบประเมิน แก้ไข หรือย้ายเข้าถังขยะ"}
              </p>
            </div>
            <p className="db-muted shrink-0 whitespace-nowrap text-sm tabular-nums">{searchTerm ? `${filteredCases.length} จาก ${cases.length} รายการ` : `${cases.length} รายการ`}</p>
          </div>

          {cases.length > 0 && (
            <div className="mt-4">
              <label htmlFor="case-search" className="sr-only">ค้นหางานประเมิน</label>
              <input
                id="case-search"
                type="search"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="ค้นหาจากชื่อ รหัส หรือชื่อไฟล์วิดีโอ"
                className="db-input w-full sm:max-w-sm"
              />
            </div>
          )}

          {loading ? <p className="db-muted mt-4 text-sm" role="status">กำลังโหลด...</p> : cases.length === 0 ? (
            <div className="mt-4">
              <p className="db-muted text-sm">{showTrash ? "ไม่มีงานประเมินในถังขยะ" : "ยังไม่มีงานประเมินที่ใช้งาน"}</p>
              {!showTrash && <Link to="/form-submit" className="btn-primary mt-3 inline-flex">ไปหน้ากรอกแบบประเมิน</Link>}
            </div>
          ) : filteredCases.length === 0 ? (
            <p className="db-muted mt-4 text-sm">ไม่พบงานประเมินที่ตรงกับ “{search.trim()}”</p>
          ) : (
            <>
              <ul className="mt-4 md:hidden">
                {pageRows.map((videoCase) => {
                  const isSelected = videoCase.id === selectedCaseId;
                  return (
                    <li key={videoCase.id} className="db-click border-t" data-selected={isSelected} style={{ borderColor: "var(--db-line)" }}>
                      <button type="button" onClick={() => selectCase(videoCase.id)} aria-pressed={isSelected} className="block w-full px-3 py-3 text-left">
                        <span className="block break-words font-semibold">{videoCase.case_title || "ไม่มีชื่อ"}</span>
                        <span className="db-muted mt-1 block break-all text-xs">{videoCase.case_key}</span>
                        <span className="db-muted mt-1 block text-xs">{evaluationCounts[videoCase.id] !== undefined ? `${evaluationCounts[videoCase.id]} แบบประเมิน · ` : ""}{formatCaseDate((showTrash && videoCase.deleted_at) || videoCase.updated_at)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 hidden overflow-x-auto md:block">
                <table className="db-table w-full min-w-[700px] text-left text-sm">
                  <thead>
                    <tr>
                      <th className="px-3 py-3">รหัส</th>
                      <th className="px-3 py-3">ชื่อ</th>
                      <th className="px-3 py-3">ไฟล์วิดีโอ</th>
                      <th className="px-3 py-3">แบบประเมิน</th>
                      <th className="px-3 py-3">{showTrash ? "ย้ายเข้าถังขยะเมื่อ" : "แก้ไขล่าสุด"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((videoCase) => {
                      const isSelected = videoCase.id === selectedCaseId;
                      return (
                        <tr key={videoCase.id} className="db-click" data-selected={isSelected} onClick={() => selectCase(videoCase.id)}>
                          <td className="px-3 py-3 align-top"><span className="db-muted break-all text-xs">{videoCase.case_key}</span></td>
                          <td className="px-3 py-3 align-top">
                            <button type="button" aria-pressed={isSelected} onClick={() => selectCase(videoCase.id)} className="text-left font-semibold">
                              {videoCase.case_title || "ไม่มีชื่อ"}
                            </button>
                          </td>
                          <td className="db-muted px-3 py-3 align-top">{videoCase.source_file_name || "ไม่มีไฟล์วิดีโอ"}</td>
                          <td className="px-3 py-3 align-top tabular-nums">{evaluationCounts[videoCase.id] ?? "—"}</td>
                          <td className="whitespace-nowrap px-3 py-3 align-top">{formatCaseDate((showTrash && videoCase.deleted_at) || videoCase.updated_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pageCount > 1 && (
                <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="เลือกหน้า">
                  <span className="db-muted text-xs tabular-nums">
                    {`แสดง ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredCases.length)} จาก ${filteredCases.length} รายการ`}
                  </span>
                  <div className="flex items-center gap-2">
                    <button type="button" className="btn-secondary text-xs" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>ก่อนหน้า</button>
                    <span className="db-muted text-xs tabular-nums" aria-live="polite">{`หน้า ${currentPage} จาก ${pageCount}`}</span>
                    <button type="button" className="btn-secondary text-xs" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>ถัดไป</button>
                  </div>
                </nav>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
