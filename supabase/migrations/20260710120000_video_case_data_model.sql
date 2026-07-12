ALTER TABLE public.video_cases
  ADD COLUMN IF NOT EXISTS order_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS subject_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS short_code TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_video_cases_order_number_lower
  ON public.video_cases (lower(order_number));

CREATE INDEX IF NOT EXISTS idx_video_cases_subject_name_lower
  ON public.video_cases (lower(subject_name));

CREATE INDEX IF NOT EXISTS idx_video_cases_order_subject_short_code_lower
  ON public.video_cases (lower(order_number), lower(subject_name), lower(short_code));

CREATE OR REPLACE FUNCTION public.normalize_video_case_key_part(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    lower(btrim(COALESCE(p_value, ''))),
    '\s+',
    '-',
    'g'
  );
$$;

CREATE OR REPLACE FUNCTION public.build_video_case_key(
  p_order_number TEXT,
  p_subject_name TEXT,
  p_short_code TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_order_number TEXT;
  v_subject_name TEXT;
  v_short_code TEXT;
BEGIN
  v_order_number := public.normalize_video_case_key_part(p_order_number);
  v_subject_name := public.normalize_video_case_key_part(p_subject_name);
  v_short_code := public.normalize_video_case_key_part(p_short_code);

  IF v_order_number = '' OR v_subject_name = '' OR v_short_code = '' THEN
    RAISE EXCEPTION 'order_number, subject_name, and short_code are required to build a video case key'
      USING ERRCODE = '22023';
  END IF;

  RETURN v_order_number || '-' || v_subject_name || '-' || v_short_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_video_case_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.case_key IS NULL OR btrim(NEW.case_key) = '' THEN
    IF NEW.order_number IS NOT NULL
      AND btrim(NEW.order_number) <> ''
      AND NEW.subject_name IS NOT NULL
      AND btrim(NEW.subject_name) <> ''
      AND NEW.short_code IS NOT NULL
      AND btrim(NEW.short_code) <> '' THEN
      NEW.case_key := public.build_video_case_key(NEW.order_number, NEW.subject_name, NEW.short_code);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_video_case_key ON public.video_cases;
CREATE TRIGGER trg_sync_video_case_key
BEFORE INSERT OR UPDATE ON public.video_cases
FOR EACH ROW
EXECUTE FUNCTION public.sync_video_case_key();
