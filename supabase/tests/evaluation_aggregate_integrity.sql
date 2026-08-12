BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(12);

SELECT has_column(
  'public',
  'evaluations',
  'source_doc_id',
  'evaluations has source_doc_id'
);
SELECT has_column(
  'public',
  'evaluations',
  'pdf_storage_path',
  'evaluations has pdf_storage_path'
);
SELECT has_column(
  'public',
  'evaluations',
  'docx_storage_path',
  'evaluations has docx_storage_path'
);
SELECT has_table(
  'public',
  'video_case_aggregate_sources',
  'aggregate source table exists'
);
SELECT has_pk(
  'public',
  'video_case_aggregate_sources',
  'aggregate source table has a primary key'
);
SELECT has_column(
  'public',
  'video_case_aggregate_sources',
  'aggregate_id',
  'aggregate source table has aggregate_id'
);
SELECT has_column(
  'public',
  'video_case_aggregate_sources',
  'evaluation_id',
  'aggregate source table has evaluation_id'
);
SELECT has_column(
  'public',
  'video_case_aggregate_sources',
  'source_position',
  'aggregate source table has source_position'
);
SELECT fk_ok(
  'public',
  'video_case_aggregate_sources',
  'aggregate_id',
  'public',
  'video_case_aggregates',
  'id'
);
SELECT fk_ok(
  'public',
  'video_case_aggregate_sources',
  'evaluation_id',
  'public',
  'evaluations',
  'id'
);
SELECT has_trigger(
  'public',
  'video_case_aggregates',
  'trg_sync_video_case_aggregate_sources',
  'aggregate source sync trigger exists'
);
SELECT policies_are(
  'public',
  'video_case_aggregate_sources',
  ARRAY['video_case_aggregate_sources_select_related']
);

SELECT * FROM finish();
ROLLBACK;
