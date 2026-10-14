import { getSections } from '../src/config/sections';

const params = new URLSearchParams(location.search);
const role = params.get('role') || 'admin';
const memberRole = params.get('memberRole') || 'leader';
const publicPage = ['/', '/register', '/forgot-password', '/reset-password'].includes(location.pathname);
const uid = '00000000-0000-4000-8000-000000000001';
const cid = '00000000-0000-4000-8000-000000000010';
const aid = '00000000-0000-4000-8000-000000000020';
const date = '2026-09-22T09:00:00Z';
const user = { id: uid, email: 'reviewer@example.invalid', user_metadata: {}, app_metadata: {}, created_at: date };
const session = { user, expires_at: 4102444800, access_token: 'fixture-not-a-credential', refresh_token: 'fixture-not-a-credential' };
const person = { auth_user_id: uid, user_id: 'reviewer-demo', full_name: 'ผู้ประเมินตัวอย่าง', employee_number: 'DEMO-001', email: user.email, role, gender: 'prefer_not_to_say', avatar_url: null, created_at: date };
const sections = getSections('th');
function rubric(score: number) {
  return Object.fromEntries(sections.map(s => [s.id, Object.fromEntries(s.questions.map(q => [q.storageKey, score]))]));
}
const caseRow = { id: cid, case_key: 'DEMO-VIDEO-001', case_title: 'วิดีโอการสอนตัวอย่าง', source_file_name: 'demo-video.mp4', video_object_key: null, created_by: uid, created_at: date, updated_at: date };
const evaluations = [1, 5].map((score, i) => ({ id: 235 + i, user_id: uid, created_by: uid, employee_number: 'DEMO-001', video_case_id: cid, analysis_kind: 'human', order_number: 'DEMO-001', subject_name: `วิดีโอการสอนตัวอย่าง — รอบ ${i+1}`, overall_suggestion: 'ข้อมูลจำลองสำหรับอธิบายหน้าจอ', rubric: rubric(score), analysis_ai_model: null, analysis_ai_output: { summary: 'ตัวอย่างผลประเมินสำหรับงานออกแบบ' }, analysis_ai_raw_text: 'ตัวอย่างผลประเมินสำหรับงานออกแบบ', document_status: 'pending', document_error: null, source_doc_id: null, pdf_storage_path: null, docx_storage_path: null, created_at: date }));
const aggregate = { id: aid, video_case_id: cid, requested_by: uid, requested_by_name: 'ผู้ประเมินตัวอย่าง', requested_by_employee_number: 'DEMO-001', source_evaluation_ids: [235, 236], source_count: 2, source_snapshot: { case_title: caseRow.case_title, source_runs: evaluations.map(e => ({ ...e, evaluation_id: e.id, analyst_user_id: uid })) }, combined_scores: rubric(3), section_averages: Object.fromEntries(sections.map(s=>[s.id,3])), ai_output: { summary: 'คะแนนเฉลี่ยจากสองการประเมินเท่ากับ 3.00 ข้อมูลจำลองเพื่ออธิบายหน้าจอ', strengths: ['เนื้อหาเป็นลำดับ'], improvements: ['ปรับคุณภาพเสียงให้สม่ำเสมอ'] }, ai_raw_text: 'คะแนนเฉลี่ยจากสองการประเมินเท่ากับ 3.00', ai_model: 'demo', status: 'ready', error: null, document_status: 'pending', document_error: null, source_doc_id: null, pdf_storage_path: null, docx_storage_path: null, created_at: date, updated_at: date };
const tables: Record<string, any[]> = {
  user_information: [person, { ...person, auth_user_id: '00000000-0000-4000-8000-000000000002', user_id: 'member-demo', full_name: 'สมาชิกตัวอย่าง', email: 'member@example.invalid', employee_number: 'DEMO-002', role: 'user' }],
  video_cases: [caseRow],
  video_case_members: [{ id: 'demo-membership', video_case_id: cid, user_id: uid, member_role: memberRole, created_at: date }],
  evaluations,
  video_case_aggregates: [aggregate],
  video_case_aggregate_sources: [235,236].map((id,i)=>({ aggregate_id: aid, evaluation_id: id, source_position: i })),
  role_requests: [{ id: 'demo-request', user_id: uid, requested_role: 'editor', status: 'pending', created_at: date, updated_at: date, reviewed_by: null, reviewed_at: null }],
};
const denied = () => Promise.resolve({ data: null, error: { message: 'Read-only design fixture: no data was changed.' } });
function query(table: string) {
  let rows = [...(tables[table] || [])]; let single = false; let write = false;
  const q: any = {
    select: () => q, eq: (k: string,v: unknown) => { rows = rows.filter(r=>String(r[k])===String(v)); return q; },
    neq: (k:string,v:unknown)=>{rows=rows.filter(r=>r[k]!==v);return q;},
    in: (k: string,v: unknown[])=>{rows=rows.filter(r=>v.includes(r[k]));return q;},
    order: ()=>q, limit: (n:number)=>{rows=rows.slice(0,n);return q;},
    maybeSingle: ()=>{single=true;return q;}, single: ()=>{single=true;return q;},
    insert: ()=>{write=true;return q;}, update: ()=>{write=true;return q;}, delete: ()=>{write=true;return q;}, upsert: ()=>{write=true;return q;},
    then: (resolve: any,reject:any)=>Promise.resolve(write ? {data:null,error:{message:'Read-only design fixture'}} : {data:single ? rows[0]??null : rows,error:null,count:rows.length}).then(resolve,reject),
  }; return q;
}
export const supabaseAuthStorageKey = 'via-design-fixture-session';
export const supabase: any = {
  from: query,
  auth: {
    getUser: async()=>({data:{user:publicPage?null:user},error:null}),
    getSession: async()=>({data:{session:publicPage?null:session},error:null}),
    onAuthStateChange: ()=>({data:{subscription:{unsubscribe(){}}}}),
    signInWithPassword: denied, signUp: denied, signOut: denied, resetPasswordForEmail: denied, updateUser: denied,
  },
  rpc: async(name:string)=>name==='can_manage_video_case' ? {data:role==='admin'||memberRole==='leader',error:null}: {data:null,error:{message:'Read-only design fixture'}},
  functions: {invoke:denied},
  storage: {from:()=>({createSignedUrl:denied,getPublicUrl:()=>({data:{publicUrl:''}}),upload:denied,remove:denied})},
};
