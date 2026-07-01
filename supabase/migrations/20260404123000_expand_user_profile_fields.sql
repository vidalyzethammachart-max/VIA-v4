ALTER TABLE public.user_information
  ADD COLUMN IF NOT EXISTS full_name text NULL,
  ADD COLUMN IF NOT EXISTS employee_number text NULL,
  ADD COLUMN IF NOT EXISTS gender text NULL,
  ADD COLUMN IF NOT EXISTS avatar_url text NULL;

ALTER TABLE public.user_information
  DROP CONSTRAINT IF EXISTS user_information_gender_check;

ALTER TABLE public.user_information
  ADD CONSTRAINT user_information_gender_check
  CHECK (
    gender IS NULL OR gender IN ('male', 'female', 'other', 'prefer_not_to_say')
  );

CREATE INDEX IF NOT EXISTS user_information_employee_number_idx
  ON public.user_information (employee_number)
  WHERE employee_number IS NOT NULL;
