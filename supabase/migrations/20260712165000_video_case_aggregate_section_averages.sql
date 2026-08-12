ALTER TABLE public.video_case_aggregates
  ADD COLUMN IF NOT EXISTS section_averages jsonb NOT NULL DEFAULT '{}'::jsonb;
