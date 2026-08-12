import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import MainNavbar from "../components/MainNavbar";
import {
  getVideoCaseAggregate,
  getVideoCaseAggregateDocumentUrls,
  type VideoCaseAggregateRow,
} from "../services/videoCaseService";
import {
  resolveVideoCaseSummaryDocumentState,
  type VideoCaseSummaryDocumentState,
} from "../services/videoCaseSummaryDocumentPreviewCore.js";

type ArtifactUrls = {
  pdfUrl: string | null;
  docxUrl: string | null;
};

const POLL_INTERVAL_MS = 5000;
const SIGNED_URL_REFRESH_MS = 50 * 60 * 1000;
const SIGNED_URL_RETRY_MS = 30 * 1000;

function getStateMessage(state: VideoCaseSummaryDocumentState): string | null {
  switch (state.kind) {
    case "not_found":
      return "ไม่พบผลสรุปที่ต้องการ";
    case "mismatched_case":
      return "ผลสรุปนี้ไม่ได้อยู่ใน Video Case ที่ระบุ";
    case "failed":
      return state.error;
    case "ready_without_artifact":
      return "สร้างผลสรุปแล้ว แต่ยังไม่พบไฟล์ PDF หรือ DOCX";
    default:
      return null;
  }
}

export default function VideoCaseSummaryDocumentPreviewPage() {
  const { videoCaseId, summaryId } = useParams<{
    videoCaseId: string;
    summaryId: string;
  }>();
  const [loading, setLoading] = useState(true);
  const [aggregate, setAggregate] = useState<VideoCaseAggregateRow | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [artifactUrls, setArtifactUrls] = useState<ArtifactUrls | null>(null);
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [artifactError, setArtifactError] = useState<string | null>(null);

  const documentState = resolveVideoCaseSummaryDocumentState(
    aggregate,
    videoCaseId || "",
  );

  useEffect(() => {
    setLoading(true);
    setAggregate(null);
    setQueryError(null);
    setArtifactUrls(null);
    setArtifactLoading(false);
    setArtifactError(null);

    let active = true;

    const loadAggregate = async () => {
      if (!summaryId || !videoCaseId) {
        if (active) setLoading(false);
        return;
      }

      try {
        const row = await getVideoCaseAggregate(summaryId);
        if (!active) return;
        setAggregate(row);
        setQueryError(null);
      } catch (error) {
        if (!active) return;
        setQueryError(
          error instanceof Error ? error.message : "ไม่สามารถโหลดผลสรุปได้",
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadAggregate();

    return () => {
      active = false;
    };
  }, [summaryId, videoCaseId]);

  useEffect(() => {
    if (
      !summaryId ||
      !videoCaseId ||
      documentState.kind !== "pending" ||
      aggregate?.id !== summaryId ||
      aggregate.video_case_id !== videoCaseId
    ) {
      return;
    }

    let active = true;
    let timeoutId: number | undefined;

    const poll = async () => {
      let shouldContinue = true;

      try {
        const row = await getVideoCaseAggregate(summaryId);
        if (!active) return;
        setAggregate(row);
        setQueryError(null);
        shouldContinue = Boolean(
          row &&
            row.video_case_id === videoCaseId &&
            row.document_status === "pending",
        );
      } catch (error) {
        if (!active) return;
        setQueryError(
          error instanceof Error ? error.message : "ไม่สามารถตรวจสอบสถานะเอกสารได้",
        );
      } finally {
        if (active && shouldContinue) {
          timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    };

    timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);

    return () => {
      active = false;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    aggregate?.id,
    aggregate?.video_case_id,
    documentState.kind,
    summaryId,
    videoCaseId,
  ]);

  useEffect(() => {
    const isLoadedAggregateForRoute = Boolean(
      aggregate &&
        aggregate.id === summaryId &&
        aggregate.video_case_id === videoCaseId,
    );

    if (
      !summaryId ||
      !videoCaseId ||
      !isLoadedAggregateForRoute ||
      documentState.kind !== "ready"
    ) {
      setArtifactUrls(null);
      setArtifactLoading(false);
      setArtifactError(null);
      return;
    }

    let active = true;
    let refreshTimeoutId: number | undefined;

    const loadArtifactUrls = async (showLoading: boolean) => {
      let nextRefreshDelay = SIGNED_URL_REFRESH_MS;

      if (showLoading) {
        setArtifactLoading(true);
      }

      try {
        const urls = await getVideoCaseAggregateDocumentUrls(summaryId);
        if (!urls.pdfUrl && !urls.docxUrl) {
          throw new Error("ไม่พบลิงก์ไฟล์ PDF หรือ DOCX");
        }
        if (active) {
          setArtifactUrls(urls);
          setArtifactError(null);
        }
      } catch (error) {
        nextRefreshDelay = SIGNED_URL_RETRY_MS;
        if (!active) return;
        if (showLoading) {
          setArtifactUrls(null);
        }
        setArtifactError(
          error instanceof Error ? error.message : "ไม่สามารถเปิดไฟล์เอกสารได้",
        );
      } finally {
        if (active) {
          if (showLoading) {
            setArtifactLoading(false);
          }
          refreshTimeoutId = window.setTimeout(
            () => void loadArtifactUrls(false),
            nextRefreshDelay,
          );
        }
      }
    };

    void loadArtifactUrls(true);

    return () => {
      active = false;
      if (refreshTimeoutId !== undefined) {
        window.clearTimeout(refreshTimeoutId);
      }
    };
  }, [
    aggregate,
    documentState.kind,
    summaryId,
    videoCaseId,
  ]);

  if (!videoCaseId || !summaryId) {
    return <Navigate to="/video-cases" replace />;
  }

  const stateError = getStateMessage(documentState);
  const displayError =
    queryError || stateError || (artifactUrls ? null : artifactError);

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 md:py-8">
        <section className="ui-hover-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#04418b]">
                Video Case Summary Document
              </p>
              <h1 className="mt-1 text-xl font-semibold text-slate-900">
                เอกสารสรุปผลแบบประเมิน
              </h1>
              <p className="mt-2 text-xs text-slate-500">
                Aggregate ID: {summaryId}
              </p>
              {aggregate && (
                <p className="mt-1 text-xs text-slate-500">
                  รวมจากแบบประเมิน {aggregate.source_count} รายการ
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {artifactUrls?.docxUrl && (
                <a
                  href={artifactUrls.docxUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary text-center"
                >
                  ดาวน์โหลด DOCX
                </a>
              )}
              {artifactUrls?.pdfUrl && (
                <a
                  href={artifactUrls.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary text-center"
                >
                  ดาวน์โหลด PDF
                </a>
              )}
              <Link
                to={`/video-cases/${videoCaseId}/summaries/${summaryId}`}
                className="btn-secondary text-center"
              >
                กลับไปหน้าสรุป
              </Link>
              <Link
                to={`/video-cases/${videoCaseId}`}
                className="btn-secondary text-center"
              >
                กลับไป Video Case
              </Link>
            </div>
          </div>
        </section>

        {artifactError && artifactUrls && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
            ไม่สามารถต่ออายุลิงก์เอกสารได้ ระบบจะลองใหม่ภายใน 30 วินาที
          </section>
        )}

        {loading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            กำลังโหลดเอกสาร...
          </section>
        ) : displayError ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700 shadow-sm">
            {displayError}
          </section>
        ) : documentState.kind === "pending" ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-8 shadow-sm">
            <h2 className="text-base font-semibold text-amber-900">
              กำลังสร้างเอกสาร
            </h2>
            <p className="mt-2 text-sm text-amber-800">
              ระบบจะตรวจสอบสถานะใหม่ทุก 5 วินาที
            </p>
          </section>
        ) : artifactLoading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            กำลังเตรียมลิงก์เอกสาร...
          </section>
        ) : artifactUrls?.pdfUrl ? (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <iframe
              title="Video case summary document preview"
              src={artifactUrls.pdfUrl}
              className="h-[800px] w-full"
            />
          </section>
        ) : artifactUrls?.docxUrl ? (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm">
            <h2 className="text-base font-semibold text-emerald-900">
              เอกสารพร้อมใช้งาน
            </h2>
            <p className="mt-2 text-sm text-emerald-800">
              เอกสารนี้มีเฉพาะไฟล์ DOCX กรุณาเปิดจากปุ่มดาวน์โหลดด้านบน
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
