BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(5);

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
  '00000000-0000-4000-8000-000000000101',
  'authenticated',
  'authenticated',
  'aggregate-integrity@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"employee_number":"TEST-0001"}'::jsonb,
  now(),
  now()
);

INSERT INTO public.video_cases (
  id,
  title,
  case_key,
  case_title,
  created_by
) VALUES
  (
    '00000000-0000-4000-8000-000000000111',
    'Integrity case A',
    'integrity-case-a',
    'Integrity case A',
    '00000000-0000-4000-8000-000000000101'
  ),
  (
    '00000000-0000-4000-8000-000000000112',
    'Integrity case B',
    'integrity-case-b',
    'Integrity case B',
    '00000000-0000-4000-8000-000000000101'
  );

INSERT INTO public.evaluations (
  id,
  order_number,
  user_id,
  video_case_id,
  subject_name,
  rubric,
  document_status
) VALUES
  (
    900001,
    'TEST-001',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000111',
    'Integrity evaluation 1',
    '{"1":{"q1":5}}'::jsonb,
    'pending'
  ),
  (
    900002,
    'TEST-002',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000111',
    'Integrity evaluation 2',
    '{"1":{"q1":3}}'::jsonb,
    'pending'
  ),
  (
    900003,
    'TEST-003',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000112',
    'Integrity evaluation 3',
    '{"1":{"q1":4}}'::jsonb,
    'pending'
  );

INSERT INTO public.video_case_aggregates (
  id,
  video_case_id,
  requested_by,
  source_evaluation_ids,
  source_count
) VALUES (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000111',
  '00000000-0000-4000-8000-000000000101',
  ARRAY[900001, 900002],
  2
);

SELECT is(
  (
    SELECT array_agg(evaluation_id ORDER BY source_position)
    FROM public.video_case_aggregate_sources
    WHERE aggregate_id = '00000000-0000-4000-8000-000000000201'
  ),
  ARRAY[900001::bigint, 900002::bigint],
  'source rows preserve aggregate ordering'
);

SELECT throws_ok(
  $$
    UPDATE public.video_case_aggregates
    SET source_evaluation_ids = ARRAY[900001, 900001]
    WHERE id = '00000000-0000-4000-8000-000000000201'
  $$,
  '22023',
  'Aggregate source evaluation IDs must be unique.',
  'duplicate source IDs are rejected'
);

SELECT throws_ok(
  $$
    UPDATE public.video_case_aggregates
    SET source_evaluation_ids = ARRAY[900003]
    WHERE id = '00000000-0000-4000-8000-000000000201'
  $$,
  '23514',
  'Aggregate source evaluations must belong to the same video case.',
  'cross-case source IDs are rejected'
);

SELECT throws_ok(
  'DELETE FROM public.evaluations WHERE id = 900001',
  '23503',
  NULL,
  'a referenced evaluation cannot be deleted'
);

DELETE FROM public.video_case_aggregates
WHERE id = '00000000-0000-4000-8000-000000000201';

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.video_case_aggregate_sources
    WHERE aggregate_id = '00000000-0000-4000-8000-000000000201'
  ),
  0,
  'deleting an aggregate cascades its source links'
);

SELECT * FROM finish();
ROLLBACK;
