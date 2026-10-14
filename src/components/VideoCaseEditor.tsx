import { useEffect, useRef, useState, type FormEvent } from "react";
import { updateVideoCase, validateCaseVideo } from "../services/videoCaseEditing";
import type { VideoCaseRow } from "../services/videoCaseService";

export default function VideoCaseEditor({ videoCase, onSaved, onCancel }: {
  videoCase: VideoCaseRow;
  onSaved: (updated: VideoCaseRow) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(videoCase.case_title || "");
  const [description, setDescription] = useState(videoCase.description || "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateVideoCase({ id: videoCase.id, expectedUpdatedAt: videoCase.updated_at, caseTitle: title, description, videoFile: file });
      onSaved(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกเคสไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return (
    <dialog ref={dialog} aria-labelledby="edit-case-title" onCancel={(event) => {
      event.preventDefault();
      if (!busy.current) onCancel();
    }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/60">
      <form onSubmit={save} className="space-y-5 p-6" aria-busy={saving}>
        <div>
          <h2 id="edit-case-title" className="text-xl font-bold">แก้ไข Video Case</h2>
          <p className="mt-1 break-all text-xs text-slate-500">Case key: {videoCase.case_key}</p>
        </div>
        <fieldset disabled={saving} className="space-y-4">
          <div>
            <label htmlFor="case-edit-name" className="block text-sm font-semibold">ชื่อเคส <span className="text-red-500">*</span></label>
            <input id="case-edit-name" autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="case-edit-description" className="block text-sm font-semibold">รายละเอียด</label>
            <textarea id="case-edit-description" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="รายละเอียดหรือคำอธิบายวิดีโอของเคสนี้" className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label htmlFor="case-edit-video" className="block text-sm font-semibold">เปลี่ยนวิดีโอ</label>
            <p className="mt-1 break-all text-sm text-slate-500">ไฟล์ปัจจุบัน: {videoCase.source_file_name || "ยังไม่มีวิดีโอ"}</p>
            <input ref={fileInput} id="case-edit-video" type="file" accept=".mp4,.m4v,.mov,.webm" className="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-200 file:px-3 file:py-2 file:text-slate-800" onChange={(event) => {
              const selected = event.target.files?.[0] || null;
              const invalid = selected ? validateCaseVideo(selected) : null;
              setError(invalid);
              setFile(invalid ? null : selected);
              if (invalid) event.target.value = "";
            }} />
            <p className="mt-2 text-xs text-slate-500">MP4, M4V, MOV หรือ WebM ขนาดไม่เกิน 1GB · ไม่เลือกไฟล์ใหม่จะใช้วิดีโอเดิม</p>
            {file && <div className="mt-3 space-y-2">
              <p className="break-all text-sm">ไฟล์ใหม่: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</p>
              <button type="button" className="text-sm font-semibold text-[#04418b] underline" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ""; }}>ยกเลิกไฟล์ใหม่</button>
              <p className="text-sm text-amber-700 dark:text-amber-300">ผลประเมินและรายงานเดิมยังอ้างอิงวิดีโอก่อนเปลี่ยน การบันทึกนี้จะไม่วิเคราะห์ใหม่อัตโนมัติ</p>
            </div>}
          </div>
        </fieldset>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {saving && <p role="status" className="text-sm text-slate-600">{file ? "กำลังอัปโหลดวิดีโอและบันทึก กรุณารอสักครู่…" : "กำลังบันทึก…"}</p>}
        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <button type="button" disabled={saving} className="btn-secondary" onClick={onCancel}>ยกเลิก</button>
          <button type="submit" disabled={saving || !title.trim()} className="btn-primary disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึกการเปลี่ยนแปลง"}</button>
        </div>
      </form>
    </dialog>
  );
}
