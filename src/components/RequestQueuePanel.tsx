import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { queueStatusLabel } from "../services/queueStatus";

type Job = { id: string; target_kind: string; target_id: string; state: string; attempts: number; available_at: string; last_error: string | null };
type Health = { worker_online: boolean; paused: boolean };

export default function RequestQueuePanel() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    const [queue, worker] = await Promise.all([
      supabase.from("ai_request_queue").select("id,target_kind,target_id,state,attempts,available_at,last_error")
        .neq("state", "completed").order("created_at").limit(30),
      supabase.rpc("get_ai_queue_health"),
    ]);
    if (version !== requestVersion.current) return;
    if (queue.error || worker.error) {
      setError(queue.error?.message || worker.error?.message || "ตรวจสถานะคิวไม่สำเร็จ");
      return;
    }
    setJobs(queue.data || []);
    setHealth(worker.data?.[0] || null);
    setError(null);
  }, []);

  useEffect(() => {
    const version = requestVersion;
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 10000);
    return () => { version.current++; window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refresh]);

  async function retry(job: Job) {
    const checked = job.state === "attention" && window.confirm(
      "ตรวจสอบใน n8n แล้วว่างานเดิมหยุดทำงานและยังไม่มีเอกสารสำเร็จใช่หรือไม่? การส่งซ้ำขณะงานเดิมยังทำงานอาจสร้างเอกสารซ้ำ",
    );
    if (job.state === "attention" && !checked) return;
    setBusy(job.id);
    try {
      const { error } = await supabase.rpc("retry_ai_request", { p_id: job.id, p_delivery_checked: checked });
      if (error) setError(error.message);
      else await refresh();
    } finally { setBusy(null); }
  }

  if (!jobs.length && !error && health?.worker_online !== false && !health?.paused) return null;
  return <section className="my-6 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-200">
    <h2 className="font-semibold">คิววิเคราะห์และสร้างเอกสาร</h2>
    <p className="mt-1 text-sm text-slate-400">บันทึกข้อมูลแล้ว ระบบทยอยทำทีละงาน หากโควตา AI เต็ม งานจะรอลองใหม่ โดยไม่ต้องกรอกแบบประเมินซ้ำ</p>
    {health?.paused && <p role="alert" className="mt-3 rounded-lg bg-amber-950 p-3 text-amber-200">
      คิวหยุดรอตรวจสอบงานก่อนหน้า งานใหม่ยังบันทึกอยู่ กรุณาให้เจ้าของงานหรือแอดมินตรวจ execution ใน n8n ว่าหยุดแล้วและยังไม่มีเอกสาร ก่อนกดลองใหม่ ระบบจะไม่ส่งงานที่ไม่ทราบผลซ้ำอัตโนมัติ
    </p>}
    {health?.worker_online === false && <p role="alert" className="mt-3 rounded-lg bg-amber-950 p-3 text-amber-200">
      ยังไม่พบ worker ที่ออนไลน์ งานจะรอในคิวจนกว่าเครื่องที่รัน worker จะกลับมาทำงาน กรุณาติดต่อแอดมิน
    </p>}
    {error && <p role="alert" className="mt-2 text-red-300">{error}</p>}
    <ul className="mt-3 divide-y divide-slate-700">{jobs.map(job => <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <p>{job.target_kind === "evaluation" ? "แบบประเมิน" : "ผลรวม"} #{job.target_id}</p>
        <p className="text-sm text-sky-300">{queueStatusLabel(job.state, true)} · ส่งแล้ว {job.attempts} ครั้ง</p>
        {job.state === "retry_wait" && <p className="text-xs text-slate-400">ลองใหม่หลัง {new Date(job.available_at).toLocaleString("th-TH")}</p>}
        {job.last_error && <p className="max-w-xl text-xs text-slate-400">{job.last_error}</p>}
      </div>
      {["failed", "attention"].includes(job.state) && <button className="btn-secondary" disabled={busy === job.id} onClick={() => void retry(job)}>ลองใหม่ด้วยข้อมูลเดิม</button>}
    </li>)}</ul>
  </section>;
}
