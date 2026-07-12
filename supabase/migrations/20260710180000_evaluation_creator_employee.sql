ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employee_number text NULL;

CREATE INDEX IF NOT EXISTS idx_evaluations_created_by
  ON public.evaluations (created_by);

CREATE OR REPLACE FUNCTION public.set_evaluation_creator_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
BEGIN
  v_creator := COALESCE(auth.uid(), NEW.user_id);
  NEW.created_by := v_creator;

  IF v_creator IS NOT NULL THEN
    SELECT ui.employee_number
    INTO NEW.employee_number
    FROM public.user_information ui
    WHERE ui.auth_user_id::text = v_creator::text
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_evaluation_creator_snapshot ON public.evaluations;
CREATE TRIGGER trg_set_evaluation_creator_snapshot
BEFORE INSERT ON public.evaluations
FOR EACH ROW
EXECUTE FUNCTION public.set_evaluation_creator_snapshot();

UPDATE public.evaluations evaluation
SET
  created_by = evaluation.user_id,
  employee_number = profile.employee_number
FROM public.user_information profile
WHERE profile.auth_user_id::text = evaluation.user_id::text
  AND (
    evaluation.created_by IS DISTINCT FROM evaluation.user_id
    OR evaluation.employee_number IS DISTINCT FROM profile.employee_number
  );

CREATE OR REPLACE FUNCTION public.handle_new_user_information()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_number text;
BEGIN
  v_employee_number := NULLIF(trim(NEW.raw_user_meta_data ->> 'employee_number'), '');

  IF v_employee_number IS NULL THEN
    RAISE EXCEPTION 'employee_number is required for new registrations';
  END IF;

  INSERT INTO public.user_information (
    auth_user_id,
    user_id,
    email,
    employee_number,
    role
  )
  VALUES (
    NEW.id::text,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data ->> 'user_id'), ''), split_part(NEW.email, '@', 1), NEW.id::text),
    NEW.email,
    v_employee_number,
    'user'::public.app_role
  )
  ON CONFLICT (auth_user_id) DO UPDATE
  SET
    user_id = COALESCE(NULLIF(EXCLUDED.user_id, ''), public.user_information.user_id),
    email = COALESCE(EXCLUDED.email, public.user_information.email),
    employee_number = COALESCE(EXCLUDED.employee_number, public.user_information.employee_number);

  RETURN NEW;
END;
$$;
