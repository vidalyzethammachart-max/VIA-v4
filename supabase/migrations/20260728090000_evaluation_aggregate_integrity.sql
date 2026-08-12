ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS source_doc_id text NULL,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text NULL,
  ADD COLUMN IF NOT EXISTS docx_storage_path text NULL;

ALTER TABLE public.video_case_aggregates
  ADD COLUMN IF NOT EXISTS document_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS document_error text NULL,
  ADD COLUMN IF NOT EXISTS source_doc_id text NULL,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text NULL,
  ADD COLUMN IF NOT EXISTS docx_storage_path text NULL,
  ADD COLUMN IF NOT EXISTS section_averages jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.video_case_aggregate_sources (
  aggregate_id uuid NOT NULL
    REFERENCES public.video_case_aggregates(id) ON DELETE CASCADE,
  evaluation_id bigint NOT NULL
    REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  source_position integer NOT NULL CHECK (source_position > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aggregate_id, evaluation_id),
  UNIQUE (aggregate_id, source_position)
);

CREATE OR REPLACE FUNCTION public.sync_video_case_aggregate_sources()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  source_ids integer[] := COALESCE(NEW.source_evaluation_ids, '{}'::integer[]);
BEGIN
  IF cardinality(source_ids) <> (
    SELECT count(DISTINCT source_id)::integer
    FROM unnest(source_ids) AS source(source_id)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Aggregate source evaluation IDs must be unique.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(source_ids) AS source(source_id)
    LEFT JOIN public.evaluations evaluation
      ON evaluation.id = source.source_id
    WHERE evaluation.id IS NULL
       OR evaluation.video_case_id IS DISTINCT FROM NEW.video_case_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Aggregate source evaluations must belong to the same video case.';
  END IF;

  DELETE FROM public.video_case_aggregate_sources
  WHERE aggregate_id = NEW.id;

  INSERT INTO public.video_case_aggregate_sources (
    aggregate_id,
    evaluation_id,
    source_position
  )
  SELECT
    NEW.id,
    source_id::bigint,
    position::integer
  FROM unnest(source_ids) WITH ORDINALITY
    AS source(source_id, position);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_video_case_aggregate_sources
ON public.video_case_aggregates;

CREATE TRIGGER trg_sync_video_case_aggregate_sources
AFTER INSERT OR UPDATE OF source_evaluation_ids, video_case_id
ON public.video_case_aggregates
FOR EACH ROW
EXECUTE FUNCTION public.sync_video_case_aggregate_sources();

DO $$
DECLARE
  invalid_aggregate_id uuid;
BEGIN
  SELECT aggregate.id
  INTO invalid_aggregate_id
  FROM public.video_case_aggregates aggregate
  WHERE cardinality(COALESCE(aggregate.source_evaluation_ids, '{}'::integer[])) <> (
    SELECT count(DISTINCT source_id)::integer
    FROM unnest(COALESCE(aggregate.source_evaluation_ids, '{}'::integer[]))
      AS source(source_id)
  )
  LIMIT 1;

  IF invalid_aggregate_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot backfill aggregate sources: aggregate % contains duplicate evaluation IDs.',
      invalid_aggregate_id;
  END IF;

  SELECT aggregate.id
  INTO invalid_aggregate_id
  FROM public.video_case_aggregates aggregate
  CROSS JOIN LATERAL unnest(
    COALESCE(aggregate.source_evaluation_ids, '{}'::integer[])
  ) AS source(source_id)
  LEFT JOIN public.evaluations evaluation
    ON evaluation.id = source.source_id
  WHERE evaluation.id IS NULL
     OR evaluation.video_case_id IS DISTINCT FROM aggregate.video_case_id
  LIMIT 1;

  IF invalid_aggregate_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot backfill aggregate sources: aggregate % contains a missing or cross-case evaluation.',
      invalid_aggregate_id;
  END IF;
END;
$$;

INSERT INTO public.video_case_aggregate_sources (
  aggregate_id,
  evaluation_id,
  source_position
)
SELECT
  aggregate.id,
  source.source_id::bigint,
  source.position::integer
FROM public.video_case_aggregates aggregate
CROSS JOIN LATERAL unnest(
  COALESCE(aggregate.source_evaluation_ids, '{}'::integer[])
) WITH ORDINALITY AS source(source_id, position)
ON CONFLICT (aggregate_id, evaluation_id)
DO UPDATE SET source_position = EXCLUDED.source_position;

ALTER TABLE public.video_case_aggregate_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_case_aggregate_sources_select_related
ON public.video_case_aggregate_sources;

CREATE POLICY video_case_aggregate_sources_select_related
ON public.video_case_aggregate_sources
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.video_case_aggregates aggregate
    WHERE aggregate.id = aggregate_id
      AND public.can_view_video_case(aggregate.video_case_id)
  )
);

REVOKE ALL ON public.video_case_aggregate_sources FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.video_case_aggregate_sources FROM authenticated;
GRANT SELECT ON public.video_case_aggregate_sources TO authenticated;

NOTIFY pgrst, 'reload schema';
