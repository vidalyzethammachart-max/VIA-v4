alter table public.evaluations
  add column if not exists user_id uuid,
  add column if not exists google_doc_id text;

create index if not exists evaluations_user_id_idx
  on public.evaluations (user_id);
