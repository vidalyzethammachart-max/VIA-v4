import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import ConfirmModal from "../components/ConfirmModal";
import MainNavbar from "../components/MainNavbar";
import VideoCaseEditor from "../components/VideoCaseEditor";
import { normalizeRole, roleAtLeast, type AppRole } from "../lib/roles";
import { supabase } from "../lib/supabaseClient";
import {
  deleteVideoCaseEvaluation,
  getMyVideoCases,
  getVideoCaseAnalyses,
  getVideoCaseMembership,
  type VideoCaseEvaluationRow,
  type VideoCaseMemberRole,
  type VideoCaseRow,
} from "../services/videoCaseService";
import { getEvaluationAverage, getStatusLabel } from "../services/videoCaseEvaluationDisplay";

export default function VideoCaseDetailPage() {
  const { videoCaseId } = useParams<{ videoCaseId: string }>();
  const [loading, setLoading] = useState(true);
  const [appRole, setAppRole] = useState<AppRole>("user");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingCase, setEditingCase] = useState<VideoCaseRow | null>(null);
  const [cases, setCases] = useState<VideoCaseRow[]>([]);
  const [selectedRole, setSelectedRole] = useState<VideoCaseMemberRole | null>(null);
  const [analyses, setAnalyses] = useState<VideoCaseEvaluationRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [evaluationToDelete, setEvaluationToDelete] = useState<VideoCaseEvaluationRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selectedCase = useMemo(
    () => cases.find((item) => item.id === videoCaseId) ?? null,
    [cases, videoCaseId],
  );

  const isAdminRole = roleAtLeast(appRole, "admin");
  const effectiveCaseRole: VideoCaseMemberRole =
    isAdminRole ? "leader" : (selectedRole ?? "member");
  const canCombine = effectiveCaseRole === "leader";
  // Editors may combine too; delete rights below stay with leaders and admins.
  const canCreateGroup = canCombine || roleAtLeast(appRole, "editor");

  const loadCases = useCallback(async () => {
    const data = await getMyVideoCases();
    setCases(data);
  }, []);

  const loadCaseData = useCallback(async (currentVideoCaseId: string) => {
    const [membership, analysisRows] = await Promise.all([
      getVideoCaseMembership(currentVideoCaseId),
      getVideoCaseAnalyses(currentVideoCaseId),
    ]);

    setSelectedRole(membership?.member_role ?? null);
    setAnalyses(analysisRows);
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

  if (!videoCaseId) {
    return <Navigate to="/video-groups" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
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
        isOpen={Boolean(evaluationToDelete)}
        title="ลบแบบประเมิน"
        message={`ลบแบบประเมิน #${evaluationToDelete?.id ?? ""} ใช่ไหม? ลบแล้วกู้คืนไม่ได้`}
        variant="danger"
        onCancel={() => {
          if (!deleting) setEvaluationToDelete(null);
        }}
        onConfirm={() => void handleDeleteEvaluation()}
        confirmLabel={deleting ? "กำลังลบ..." : "ลบ"}
        cancelLabel="ยกเลิก"
        confirmDisabled={deleting}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 md:py-8">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#04418b]">รายละเอียด Video Case</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              {selectedCase?.case_title || selectedCase?.case_key || "Video Case"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {selectedCase ? `รหัสเคส: ${selectedCase.case_key}` : "เลือกเคสจากรายการ"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/video-groups" className="btn-secondary">
              กลับไปรายการเคส
            </Link>
            {selectedCase && (
              <Link to={`/form-submit?caseId=${selectedCase.id}`} className="btn-primary">
                กรอกแบบประเมิน
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
            ไม่พบ Video Case นี้
          </section>
        ) : (
          <div className="space-y-6">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-5 p-5 md:flex-row md:items-start md:justify-between md:p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#04418b]">ข้อมูลเคส</p>
                  {selectedCase.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-600">{selectedCase.description}</p>}
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedCase.source_file_name || "ไม่มีไฟล์วิดีโอ"} · แก้ไขล่าสุด {new Date(selectedCase.updated_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-start gap-3">
                {(isAdminRole || selectedCase.created_by === currentUserId) && (
                  <button type="button" className="btn-secondary" onClick={() => setEditingCase(selectedCase)}>แก้ไขเคส</button>
                )}
                <p className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  บทบาทของคุณ: {effectiveCaseRole === "leader" ? "หัวหน้าเคส" : "สมาชิก"}{isAdminRole ? " (ผู้ดูแลระบบ)" : ""}
                </p>
                </div>
              </div>
              <div className="grid grid-cols-2 border-t border-slate-200">
                <div className="border-r border-slate-200 p-3 sm:p-4">
                  <p className="text-xs font-medium text-slate-500">แบบประเมิน</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{analyses.length}</p>
                </div>
                <div className="p-3 sm:p-4">
                  <p className="text-xs font-medium text-slate-500">ผู้ประเมิน</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {new Set(analyses.map((analysis) => analysis.user_id).filter(Boolean)).size}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">รายการแบบประเมิน</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    ตรวจสอบแต่ละแบบประเมินก่อนนำมารวมผลเป็นรายงานสรุปใหม่
                  </p>
                </div>
                {canCreateGroup && selectedCase && (
                  <Link
                    to={`/video-groups/new?caseId=${selectedCase.id}`}
                    className="btn-primary text-center text-xs"
                  >
                    รวมเป็นแบบประเมินกลุ่ม
                  </Link>
                )}
              </div>

              {analyses.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">ยังไม่มีผลวิเคราะห์</p>
              ) : (
                <>
                <ul className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 md:hidden">
                  {analyses.map((run) => {
                    const overallScore = getEvaluationAverage(run);
                    const statusClass =
                      run.document_status === "ready"
                        ? "bg-emerald-50 text-emerald-700"
                        : run.document_status === "failed"
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700";
                    return (
                      <li key={run.id} className="space-y-2 p-4 text-sm">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="break-words font-semibold text-slate-900">{run.subject_name || "ไม่มีชื่อหัวข้อ"}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              #{run.id} · {run.employee_number || "-"} ·{" "}
                              {new Date(run.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                            </p>
                          </div>
                          <span className="shrink-0 text-base font-bold text-[#04418b]">
                            {overallScore === null ? "-" : overallScore.toFixed(1)}
                          </span>
                        </div>
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${statusClass}`}>
                          {getStatusLabel(run.document_status)}
                        </span>
                        {run.overall_suggestion?.trim() && (
                          <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{run.overall_suggestion.trim()}</p>
                        )}
                        <div className="flex gap-2">
                          <Link to={`/preview/${run.id}`} className="btn-secondary text-xs">ดูสรุปผล</Link>
                          {canCombine && (
                            <button type="button" onClick={() => setEvaluationToDelete(run)} className="btn-danger text-xs">ลบ</button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
                  <table className="min-w-[1060px] w-full border-collapse text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="sticky left-0 z-10 min-w-48 border-b border-slate-200 bg-slate-50 px-4 py-3 font-semibold">แบบประเมิน</th>
                        <th className="min-w-28 border-b border-l border-slate-200 px-3 py-3 text-center font-semibold">สถานะ</th>
                        <th className="min-w-28 border-b border-l border-slate-200 px-3 py-3 text-center font-semibold">รหัสพนักงาน</th>
                        <th className="min-w-20 border-b border-l border-slate-200 px-3 py-3 text-center font-semibold">คะแนนเฉลี่ย</th>
                        <th className="min-w-80 border-b border-l border-slate-200 px-4 py-3 font-semibold">ข้อเสนอแนะโดยรวม</th>
                        <th className="min-w-28 border-b border-l border-slate-200 px-3 py-3 text-center font-semibold">ดูสรุปผล</th>
                        {canCombine && <th className="min-w-20 border-b border-l border-slate-200 px-3 py-3 text-center font-semibold">ลบ</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {analyses.map((run) => {
                        const overallScore = getEvaluationAverage(run);
                        const statusClass =
                          run.document_status === "ready"
                            ? "bg-emerald-50 text-emerald-700"
                            : run.document_status === "failed"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700";

                        return (
                          <tr key={run.id} className="align-top hover:bg-slate-50/70">
                            <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3">
                              <p className="font-semibold text-slate-900">{run.subject_name || "ไม่มีชื่อหัวข้อ"}</p>
                              <p className="mt-1 text-slate-500">แบบประเมิน #{run.id}</p>
                              <p className="mt-1 text-slate-500">{new Date(run.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</p>
                            </td>
                            <td className="border-l border-slate-200 px-3 py-3 text-center">
                              <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 font-semibold ${statusClass}`}>
                                {getStatusLabel(run.document_status)}
                              </span>
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
                            <td className="border-l border-slate-200 px-3 py-3 text-center">
                              <Link
                                to={`/preview/${run.id}`}
                                className="btn-secondary text-xs"
                              >
                                ดูสรุปผล
                              </Link>
                            </td>
                            {canCombine && (
                              <td className="border-l border-slate-200 px-3 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => setEvaluationToDelete(run)}
                                  className="btn-danger text-xs"
                                >
                                  ลบ
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </section>


          </div>
        )}
      </main>
    </div>
  );
}
