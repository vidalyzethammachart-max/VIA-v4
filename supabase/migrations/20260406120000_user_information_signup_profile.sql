-- Create user_information rows during auth signup without relying on a browser session.

CREATE OR REPLACE FUNCTION public.handle_new_user_information()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_information (
    auth_user_id,
    user_id,
    email,
    role
  )
  VALUES (
    NEW.id::text,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data ->> 'user_id'), ''), split_part(NEW.email, '@', 1), NEW.id::text),
    NEW.email,
    'user'::public.app_role
  )
  ON CONFLICT (auth_user_id) DO UPDATE
  SET
    user_id = COALESCE(NULLIF(EXCLUDED.user_id, ''), public.user_information.user_id),
    email = COALESCE(EXCLUDED.email, public.user_information.email);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_new_user_information ON auth.users;
CREATE TRIGGER trg_handle_new_user_information
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_information();

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT COALESCE(
    (
      SELECT ui.role
      FROM public.user_information ui
      WHERE ui.auth_user_id::text = auth.uid()::text
      LIMIT 1
    ),
    'user'::public.app_role
  );
$$;

CREATE OR REPLACE FUNCTION public.role_at_least(required_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT CASE public.current_user_role()
    WHEN 'admin'::public.app_role THEN true
    WHEN 'editor'::public.app_role THEN required_role IN ('editor'::public.app_role, 'user'::public.app_role)
    WHEN 'user'::public.app_role THEN required_role = 'user'::public.app_role
    ELSE false
  END;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.role_at_least(public.app_role) TO authenticated;

ALTER TABLE public.user_information ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_information_select_own ON public.user_information;
DROP POLICY IF EXISTS user_information_insert_own ON public.user_information;
DROP POLICY IF EXISTS user_information_update_own ON public.user_information;
DROP POLICY IF EXISTS user_information_all_admin ON public.user_information;

CREATE POLICY user_information_select_own
ON public.user_information
FOR SELECT
TO authenticated
USING (auth.uid()::text = auth_user_id::text);

CREATE POLICY user_information_insert_own
ON public.user_information
FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::text = auth_user_id::text);

CREATE POLICY user_information_update_own
ON public.user_information
FOR UPDATE
TO authenticated
USING (auth.uid()::text = auth_user_id::text)
WITH CHECK (auth.uid()::text = auth_user_id::text);

CREATE POLICY user_information_all_admin
ON public.user_information
FOR ALL
TO authenticated
USING (public.role_at_least('admin'::public.app_role))
WITH CHECK (public.role_at_least('admin'::public.app_role));

GRANT SELECT, INSERT, UPDATE ON public.user_information TO authenticated;

-- Dashboard is an aggregate view for signed-in users, so authenticated users
-- need read access to evaluation rows. Pages that show personal submissions
-- still filter by user_id in application code.
DROP POLICY IF EXISTS evaluations_select_dashboard_authenticated ON public.evaluations;

CREATE POLICY evaluations_select_dashboard_authenticated
ON public.evaluations
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.evaluations TO authenticated;
