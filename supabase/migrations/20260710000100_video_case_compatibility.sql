create extension if not exists pgcrypto;

alter table public.video_cases
  add column if not exists case_key text,
  add column if not exists case_title text,
  add column if not exists source_file_name text,
  add column if not exists video_object_key text;

create unique index if not exists ux_video_cases_case_key
  on public.video_cases (case_key);

create index if not exists idx_video_cases_case_key
  on public.video_cases (case_key, created_at desc);

create or replace function public.resolve_video_case_membership(
  p_case_key text,
  p_case_title text default null,
  p_source_file_name text default null,
  p_video_object_key text default null,
  p_member_role text default 'member'
)
returns public.video_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_case public.video_cases;
  v_member_role text := case when p_member_role = 'leader' then 'leader' else 'member' end;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_case_key is null or btrim(p_case_key) = '' then
    raise exception 'Case key is required' using errcode = '22023';
  end if;

  insert into public.video_cases (
    case_key,
    case_title,
    source_file_name,
    video_object_key,
    created_by
  )
  values (
    lower(btrim(p_case_key)),
    nullif(btrim(coalesce(p_case_title, '')), ''),
    nullif(btrim(coalesce(p_source_file_name, '')), ''),
    nullif(btrim(coalesce(p_video_object_key, '')), ''),
    v_actor
  )
  on conflict (case_key) do update
  set
    case_title = coalesce(excluded.case_title, public.video_cases.case_title),
    source_file_name = coalesce(excluded.source_file_name, public.video_cases.source_file_name),
    video_object_key = coalesce(excluded.video_object_key, public.video_cases.video_object_key),
    updated_at = now()
  returning * into v_case;

  if v_member_role = 'leader' then
    update public.video_case_members
    set member_role = 'member'
    where video_case_id = v_case.id
      and user_id <> v_actor;
  end if;

  insert into public.video_case_members (
    video_case_id,
    user_id,
    member_role,
    added_by
  )
  values (
    v_case.id,
    v_actor,
    v_member_role,
    v_actor
  )
  on conflict (video_case_id, user_id) do update
  set
    member_role = excluded.member_role,
    added_by = excluded.added_by;

  return v_case;
end;
$$;

grant execute on function public.resolve_video_case_membership(text, text, text, text, text) to authenticated;

alter table public.evaluations
  add column if not exists analysis_kind text not null default 'human'
    check (analysis_kind in ('human', 'aggregate')),
  add column if not exists analysis_ai_model text null,
  add column if not exists analysis_ai_output jsonb null,
  add column if not exists analysis_ai_raw_text text null,
  add column if not exists video_case_id uuid null references public.video_cases(id) on delete set null;

create index if not exists evaluations_video_case_id_created_at_idx
  on public.evaluations (video_case_id, created_at desc);

create table if not exists public.video_case_aggregates (
  id uuid primary key default gen_random_uuid(),
  video_case_id uuid not null references public.video_cases(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  source_evaluation_ids integer[] not null default '{}'::integer[],
  source_count integer not null default 0 check (source_count >= 0),
  source_snapshot jsonb not null default '{}'::jsonb,
  combined_scores jsonb not null default '{}'::jsonb,
  ai_model text null,
  ai_output jsonb null,
  ai_raw_text text null,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_video_case_aggregates_case_created_at
  on public.video_case_aggregates (video_case_id, created_at desc);

create index if not exists idx_video_case_aggregates_requested_by_created_at
  on public.video_case_aggregates (requested_by, created_at desc);

alter table public.video_case_aggregates enable row level security;

drop policy if exists video_case_aggregates_select_related on public.video_case_aggregates;
drop policy if exists video_case_aggregates_insert_leader on public.video_case_aggregates;
drop policy if exists video_case_aggregates_update_leader on public.video_case_aggregates;

create policy video_case_aggregates_select_related
on public.video_case_aggregates
for select
to authenticated
using (public.can_view_video_case(video_case_id));

create policy video_case_aggregates_insert_leader
on public.video_case_aggregates
for insert
to authenticated
with check (
  auth.uid() = requested_by
  and (
    public.current_video_case_role(video_case_id) = 'leader'
    or public.role_at_least('admin'::public.app_role)
  )
);

create policy video_case_aggregates_update_leader
on public.video_case_aggregates
for update
to authenticated
using (
  auth.uid() = requested_by
  and (
    public.current_video_case_role(video_case_id) = 'leader'
    or public.role_at_least('admin'::public.app_role)
  )
)
with check (
  auth.uid() = requested_by
  and (
    public.current_video_case_role(video_case_id) = 'leader'
    or public.role_at_least('admin'::public.app_role)
  )
);

grant select, insert, update, delete on public.video_case_aggregates to authenticated;

