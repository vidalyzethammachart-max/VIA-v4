import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

export const actor = '00000000-0000-4000-8000-000000000001';
export const other = '00000000-0000-4000-8000-000000000002';
export const caseId = '00000000-0000-4000-8000-000000000003';
export const aggregateId = '00000000-0000-4000-8000-000000000004';
export const migrations = new URL('../../supabase/migrations/', import.meta.url);

export async function documentDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, is_admin boolean DEFAULT false);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    CREATE TYPE public.app_role AS ENUM ('user','editor','admin');
    CREATE FUNCTION public.role_at_least(public.app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS
      'SELECT coalesce((SELECT is_admin FROM auth.users WHERE id=auth.uid()),false)';
    CREATE TABLE public.video_cases(id uuid PRIMARY KEY, deleted_at timestamptz);
    CREATE TABLE public.video_case_members(video_case_id uuid, user_id uuid, role text);
    CREATE FUNCTION public.current_video_case_role(uuid) RETURNS text LANGUAGE sql AS
      'SELECT role FROM public.video_case_members WHERE video_case_id=$1 AND user_id=auth.uid()';
    CREATE TABLE public.evaluations(id bigint PRIMARY KEY,user_id uuid,video_case_id uuid,
      document_status text,document_error text,pdf_storage_path text,docx_storage_path text);
    CREATE TABLE public.video_case_aggregates(id uuid PRIMARY KEY,requested_by uuid,video_case_id uuid,
      document_status text,document_error text,pdf_storage_path text,docx_storage_path text);
    INSERT INTO auth.users(id) VALUES ('${actor}'),('${other}');
    INSERT INTO public.video_cases(id) VALUES ('${caseId}');
    INSERT INTO public.video_case_members VALUES ('${caseId}','${actor}','leader');
    INSERT INTO public.evaluations(id,user_id,video_case_id,document_status) VALUES
      (246,'${actor}','${caseId}','pending'),(247,'${actor}','${caseId}','pending'),
      (999,'${other}','${caseId}','pending');
    INSERT INTO public.video_case_aggregates(id,requested_by,video_case_id,document_status)
      VALUES ('${aggregateId}','${actor}','${caseId}','pending');
  `);
  for (const name of ['20261014130000_central_request_queue.sql', '20261014140000_secure_queue_payload.sql']) {
    await db.exec(await readFile(new URL(name, migrations), 'utf8'));
  }
  return db;
}
