-- The older guard (role_requests migration) rejects any role change that has no signed-in admin, which
-- includes the SQL Editor (auth.uid() is NULL there). Without this bypass the super admin can never be
-- assigned. session_user is the login role, so it is not changed by SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION public.guard_user_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.role() = 'service_role' OR session_user IN ('postgres', 'supabase_admin') THEN
      RETURN NEW;
    END IF;

    IF auth.uid() IS NULL OR NOT public.role_at_least('admin'::public.app_role) THEN
      RAISE EXCEPTION 'Only admins can change user roles' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
