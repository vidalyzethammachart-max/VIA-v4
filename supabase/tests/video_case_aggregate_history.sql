BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(8);

SELECT has_column(
  'public',
  'video_case_aggregates',
  'requested_by_name',
  'video case aggregates has requested_by_name'
);
SELECT has_column(
  'public',
  'video_case_aggregates',
  'requested_by_employee_number',
  'video case aggregates has requested_by_employee_number'
);
SELECT has_trigger(
  'public',
  'video_case_aggregates',
  'trg_snapshot_video_case_aggregate_requester',
  'aggregate requester snapshot trigger exists'
);
SELECT policies_are(
  'public',
  'video_case_aggregates',
  ARRAY[
    'video_case_aggregates_delete_leader',
    'video_case_aggregates_insert_leader',
    'video_case_aggregates_select_related',
    'video_case_aggregates_update_leader'
  ]
);

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000301',
  'authenticated',
  'authenticated',
  'aggregate-history@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"employee_number":"HIST-001"}'::jsonb,
  now(),
  now()
);

UPDATE public.user_information
SET full_name = 'History Leader',
    employee_number = 'HIST-001'
WHERE auth_user_id::text = '00000000-0000-4000-8000-000000000301';

INSERT INTO public.video_cases (
  id,
  title,
  case_key,
  case_title,
  created_by
) VALUES (
  '00000000-0000-4000-8000-000000000311',
  'Aggregate history case',
  'aggregate-history-case',
  'Aggregate history case',
  '00000000-0000-4000-8000-000000000301'
);

INSERT INTO public.video_case_aggregates (
  id,
  video_case_id,
  requested_by,
  source_evaluation_ids,
  source_count
) VALUES (
  '00000000-0000-4000-8000-000000000321',
  '00000000-0000-4000-8000-000000000311',
  '00000000-0000-4000-8000-000000000301',
  '{}'::integer[],
  0
);

SELECT is(
  (
    SELECT requested_by_name
    FROM public.video_case_aggregates
    WHERE id = '00000000-0000-4000-8000-000000000321'
  ),
  'History Leader',
  'insert snapshots requester full name'
);

SELECT is(
  (
    SELECT requested_by_employee_number
    FROM public.video_case_aggregates
    WHERE id = '00000000-0000-4000-8000-000000000321'
  ),
  'HIST-001',
  'insert snapshots requester employee number'
);

UPDATE public.user_information
SET full_name = 'Renamed Leader',
    employee_number = 'HIST-002'
WHERE auth_user_id::text = '00000000-0000-4000-8000-000000000301';

SELECT is(
  (
    SELECT requested_by_name || ':' || requested_by_employee_number
    FROM public.video_case_aggregates
    WHERE id = '00000000-0000-4000-8000-000000000321'
  ),
  'History Leader:HIST-001',
  'profile edits do not mutate an existing snapshot'
);

INSERT INTO public.video_case_aggregates (
  id,
  video_case_id,
  requested_by,
  requested_by_name,
  requested_by_employee_number,
  source_evaluation_ids,
  source_count
) VALUES (
  '00000000-0000-4000-8000-000000000322',
  '00000000-0000-4000-8000-000000000311',
  '00000000-0000-4000-8000-000000000301',
  'Imported Name',
  'IMPORTED-001',
  '{}'::integer[],
  0
);

SELECT is(
  (
    SELECT requested_by_name || ':' || requested_by_employee_number
    FROM public.video_case_aggregates
    WHERE id = '00000000-0000-4000-8000-000000000322'
  ),
  'Imported Name:IMPORTED-001',
  'the trigger preserves explicitly supplied snapshots'
);

SELECT * FROM finish();
ROLLBACK;
