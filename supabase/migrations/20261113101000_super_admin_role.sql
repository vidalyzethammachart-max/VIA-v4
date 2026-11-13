-- Step 2 of 3 for the super admin role (run after 20261113100000 has completed).
-- Hierarchy: user < editor < admin < super_admin. A super admin satisfies every role requirement.

CREATE OR REPLACE FUNCTION public.role_at_least(required_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT CASE public.current_user_role()
    WHEN 'super_admin'::public.app_role THEN true
    WHEN 'admin'::public.app_role THEN required_role <> 'super_admin'::public.app_role
    WHEN 'editor'::public.app_role THEN required_role IN ('editor'::public.app_role, 'user'::public.app_role)
    WHEN 'user'::public.app_role THEN required_role = 'user'::public.app_role
    ELSE false
  END;
$$;

GRANT EXECUTE ON FUNCTION public.role_at_least(public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.current_user_role() = 'super_admin'::public.app_role;
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- At most one super admin can exist.
CREATE UNIQUE INDEX IF NOT EXISTS user_information_single_super_admin
  ON public.user_information (role)
  WHERE role = 'super_admin'::public.app_role;

-- Only the database owner (the SQL Editor) may set or clear super_admin. This function is
-- deliberately SECURITY INVOKER so current_user is the role running the statement: the service-role
-- key used by edge functions and every authenticated session are refused.
CREATE OR REPLACE FUNCTION public.guard_super_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (
    (NEW.role = 'super_admin'::public.app_role AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM NEW.role))
    OR (TG_OP = 'UPDATE' AND OLD.role = 'super_admin'::public.app_role AND NEW.role IS DISTINCT FROM OLD.role)
  ) AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'The super_admin role can only be changed by the database owner'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_super_admin_role ON public.user_information;
CREATE TRIGGER trg_guard_super_admin_role
  BEFORE INSERT OR UPDATE OF role ON public.user_information
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_super_admin_role();

NOTIFY pgrst, 'reload schema';
