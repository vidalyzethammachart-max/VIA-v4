create extension if not exists pgcrypto;

create table if not exists public.video_cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text null,
  video_name text null,
  video_download_url text null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_video_cases_created_by_created_at
  on public.video_cases (created_by, created_at desc);

create table if not exists public.video_case_members (
  id uuid primary key default gen_random_uuid(),
  video_case_id uuid not null references public.video_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('member', 'leader')),
  added_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint video_case_members_unique_member unique (video_case_id, user_id)
);

create unique index if not exists ux_video_case_one_leader
  on public.video_case_members (video_case_id)
  where member_role = 'leader';

create index if not exists idx_video_case_members_user_id
  on public.video_case_members (user_id, created_at desc);

create index if not exists idx_video_case_members_case_id
  on public.video_case_members (video_case_id, created_at desc);

create table if not exists public.video_case_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  video_case_id uuid not null references public.video_cases(id) on delete cascade,
  analyst_user_id uuid not null references auth.users(id) on delete cascade,
  evaluation_id bigint null references public.evaluations(id) on delete set null,
  run_kind text not null default 'human' check (run_kind in ('human', 'aggregate')),
  rubric jsonb not null default '{}'::jsonb,
  matrix jsonb not null default '{}'::jsonb,
  ai_output jsonb null,
  ai_raw_text text null,
  notes text null,
  source_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_video_case_analysis_runs_evaluation_id
  on public.video_case_analysis_runs (evaluation_id)
  where evaluation_id is not null;

create index if not exists idx_video_case_analysis_runs_case_created_at
  on public.video_case_analysis_runs (video_case_id, created_at desc);

create index if not exists idx_video_case_analysis_runs_analyst_created_at
  on public.video_case_analysis_runs (analyst_user_id, created_at desc);

create table if not exists public.video_case_aggregate_runs (
  id uuid primary key default gen_random_uuid(),
  video_case_id uuid not null references public.video_cases(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  source_run_count integer not null default 0 check (source_run_count >= 0),
  source_run_ids uuid[] not null default '{}'::uuid[],
  aggregated_scores jsonb not null default '{}'::jsonb,
  aggregated_matrix jsonb not null default '{}'::jsonb,
  ai_output jsonb null,
  ai_raw_text text null,
  prompt_used text null,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_video_case_aggregate_runs_case_created_at
  on public.video_case_aggregate_runs (video_case_id, created_at desc);

create index if not exists idx_video_case_aggregate_runs_requested_by_created_at
  on public.video_case_aggregate_runs (requested_by, created_at desc);

alter table public.video_cases enable row level security;
alter table public.video_case_members enable row level security;
alter table public.video_case_analysis_runs enable row level security;
alter table public.video_case_aggregate_runs enable row level security;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_video_cases_updated_at on public.video_cases;
create trigger trg_touch_video_cases_updated_at
before update on public.video_cases
for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_video_case_analysis_runs_updated_at on public.video_case_analysis_runs;
create trigger trg_touch_video_case_analysis_runs_updated_at
before update on public.video_case_analysis_runs
for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_video_case_aggregate_runs_updated_at on public.video_case_aggregate_runs;
create trigger trg_touch_video_case_aggregate_runs_updated_at
before update on public.video_case_aggregate_runs
for each row execute function public.touch_updated_at();

create or replace function public.current_video_case_role(p_video_case_id uuid)
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when public.role_at_least('admin'::public.app_role) then 'admin'
    else coalesce((
      select vcm.member_role
      from public.video_case_members vcm
      where vcm.video_case_id = p_video_case_id
        and vcm.user_id = auth.uid()
      limit 1
    ), '')
  end;
$$;

create or replace function public.can_manage_video_case(p_video_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    public.role_at_least('admin'::public.app_role)
    or exists (
      select 1
      from public.video_cases vc
      where vc.id = p_video_case_id
        and vc.created_by = auth.uid()
    )
    or public.current_video_case_role(p_video_case_id) = 'leader';
$$;

create or replace function public.can_view_video_case(p_video_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    public.role_at_least('admin'::public.app_role)
    or exists (
      select 1
      from public.video_cases vc
      where vc.id = p_video_case_id
        and vc.created_by = auth.uid()
    )
    or exists (
      select 1
      from public.video_case_members vcm
      where vcm.video_case_id = p_video_case_id
        and vcm.user_id = auth.uid()
    );
$$;

grant execute on function public.current_video_case_role(uuid) to authenticated;
grant execute on function public.can_manage_video_case(uuid) to authenticated;
grant execute on function public.can_view_video_case(uuid) to authenticated;

drop policy if exists video_cases_select_member_or_admin on public.video_cases;
drop policy if exists video_cases_insert_own on public.video_cases;
drop policy if exists video_cases_update_creator_or_admin on public.video_cases;

create policy video_cases_select_member_or_admin
on public.video_cases
for select
to authenticated
using (public.can_view_video_case(id));

create policy video_cases_insert_own
on public.video_cases
for insert
to authenticated
with check (auth.uid() = created_by);

create policy video_cases_update_creator_or_admin
on public.video_cases
for update
to authenticated
using (
  public.role_at_least('admin'::public.app_role)
  or created_by = auth.uid()
)
with check (
  public.role_at_least('admin'::public.app_role)
  or created_by = auth.uid()
);

drop policy if exists video_case_members_select_related on public.video_case_members;
drop policy if exists video_case_members_insert_manage on public.video_case_members;
drop policy if exists video_case_members_update_manage on public.video_case_members;
drop policy if exists video_case_members_delete_manage on public.video_case_members;

create policy video_case_members_select_related
on public.video_case_members
for select
to authenticated
using (public.can_view_video_case(video_case_id));

create policy video_case_members_insert_manage
on public.video_case_members
for insert
to authenticated
with check (
  auth.uid() = user_id
  and (
    public.can_manage_video_case(video_case_id)
    or public.role_at_least('admin'::public.app_role)
  )
);

create policy video_case_members_update_manage
on public.video_case_members
for update
to authenticated
using (
  public.can_manage_video_case(video_case_id)
  or public.role_at_least('admin'::public.app_role)
)
with check (
  public.can_manage_video_case(video_case_id)
  or public.role_at_least('admin'::public.app_role)
);

create policy video_case_members_delete_manage
on public.video_case_members
for delete
to authenticated
using (
  public.can_manage_video_case(video_case_id)
  or public.role_at_least('admin'::public.app_role)
);

drop policy if exists video_case_analysis_runs_select_related on public.video_case_analysis_runs;
drop policy if exists video_case_analysis_runs_insert_member on public.video_case_analysis_runs;
drop policy if exists video_case_analysis_runs_update_owner on public.video_case_analysis_runs;
drop policy if exists video_case_analysis_runs_delete_owner on public.video_case_analysis_runs;

create policy video_case_analysis_runs_select_related
on public.video_case_analysis_runs
for select
to authenticated
using (public.can_view_video_case(video_case_id));

create policy video_case_analysis_runs_insert_member
on public.video_case_analysis_runs
for insert
to authenticated
with check (
  auth.uid() = analyst_user_id
  and public.can_view_video_case(video_case_id)
);

create policy video_case_analysis_runs_update_owner
on public.video_case_analysis_runs
for update
to authenticated
using (
  auth.uid() = analyst_user_id
  or public.role_at_least('admin'::public.app_role)
)
with check (
  auth.uid() = analyst_user_id
  or public.role_at_least('admin'::public.app_role)
);

create policy video_case_analysis_runs_delete_owner
on public.video_case_analysis_runs
for delete
to authenticated
using (
  auth.uid() = analyst_user_id
  or public.role_at_least('admin'::public.app_role)
);

drop policy if exists video_case_aggregate_runs_select_related on public.video_case_aggregate_runs;
drop policy if exists video_case_aggregate_runs_insert_leader on public.video_case_aggregate_runs;
drop policy if exists video_case_aggregate_runs_update_leader on public.video_case_aggregate_runs;

create policy video_case_aggregate_runs_select_related
on public.video_case_aggregate_runs
for select
to authenticated
using (public.can_view_video_case(video_case_id));

create policy video_case_aggregate_runs_insert_leader
on public.video_case_aggregate_runs
for insert
to authenticated
with check (
  auth.uid() = requested_by
  and (
    public.current_video_case_role(video_case_id) = 'leader'
    or public.role_at_least('admin'::public.app_role)
  )
);

create policy video_case_aggregate_runs_update_leader
on public.video_case_aggregate_runs
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

grant select, insert, update, delete on public.video_cases to authenticated;
grant select, insert, update, delete on public.video_case_members to authenticated;
grant select, insert, update, delete on public.video_case_analysis_runs to authenticated;
grant select, insert, update, delete on public.video_case_aggregate_runs to authenticated;

alter table public.evaluations
  add column if not exists video_case_id uuid null references public.video_cases(id) on delete set null,
  add column if not exists evaluation_kind text not null default 'individual' check (evaluation_kind in ('individual', 'aggregate'));

create index if not exists evaluations_video_case_id_idx
  on public.evaluations (video_case_id, created_at desc);

