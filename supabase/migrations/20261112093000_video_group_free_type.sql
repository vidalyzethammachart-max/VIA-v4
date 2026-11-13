-- Let the group type be free text (the UI still suggests group / round / year_end).
-- It stays required, trimmed and bounded; the identity index now normalizes it
-- the same way as the other two parts so "Round" and "round " count as the same group.

ALTER TABLE public.video_group_evaluations
  DROP CONSTRAINT IF EXISTS video_group_evaluations_group_type_check;

ALTER TABLE public.video_group_evaluations
  ADD CONSTRAINT video_group_evaluations_group_type_check
  CHECK (
    btrim(group_type) <> ''
    AND group_type = btrim(group_type)
    AND char_length(group_type) <= 100
  );

DROP INDEX IF EXISTS public.video_group_evaluations_identity_idx;

CREATE UNIQUE INDEX video_group_evaluations_identity_idx
  ON public.video_group_evaluations (
    public.normalize_video_case_key_part(order_number),
    public.normalize_video_case_key_part(group_type),
    public.normalize_video_case_key_part(subject_name)
  );

NOTIFY pgrst, 'reload schema';
