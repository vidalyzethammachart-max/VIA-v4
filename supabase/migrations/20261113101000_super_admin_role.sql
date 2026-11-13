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

-- Only the database owner's session (the SQL Editor) may set, clear or delete the super_admin
-- row. The check uses session_user, not current_user: PostgREST connects as `authenticator`, the
-- SQL Editor as `postgres`, and session_user stays the same inside SECURITY DEFINER functions
-- (such as review_role_request) where current_user would become the function owner. The service-role
-- key and every authenticated session therefore stay refused. Deleting the Auth user of the super
-- admin (which cascades to this table) is refused too: demote the account first.
CREATE OR REPLACE FUNCTION public.guard_super_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin') AND (
    (TG_OP = 'INSERT' AND NEW.role = 'super_admin'::public.app_role)
    OR (TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role AND (
      NEW.role = 'super_admin'::public.app_role OR OLD.role = 'super_admin'::public.app_role
    ))
    OR (TG_OP = 'DELETE' AND OLD.role = 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'The super_admin role can only be changed by the database owner'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_super_admin_role ON public.user_information;
CREATE TRIGGER trg_guard_super_admin_role
  BEFORE INSERT OR UPDATE OF role OR DELETE ON public.user_information
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_super_admin_role();

-- The role request flow must not become a way around the guard: nobody can request super_admin, and
-- an admin cannot approve a request that targets the super admin's own account.
ALTER TABLE public.role_requests
  DROP CONSTRAINT IF EXISTS role_requests_no_super_admin;
ALTER TABLE public.role_requests
  ADD CONSTRAINT role_requests_no_super_admin
  CHECK (requested_role <> 'super_admin'::public.app_role);

CREATE OR REPLACE FUNCTION public.review_role_request(
  p_request_id UUID,
  p_status TEXT
)
RETURNS public.role_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_request public.role_requests;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF NOT public.role_at_least('admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin permission required' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid review status: %', p_status USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.role_requests rr
    LEFT JOIN public.user_information ui ON ui.auth_user_id::text = rr.user_id::text
    WHERE rr.id = p_request_id
      AND (
        rr.requested_role = 'super_admin'::public.app_role
        OR ui.role = 'super_admin'::public.app_role
      )
  ) THEN
    RAISE EXCEPTION 'A role request cannot grant or change the super_admin role'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.role_requests rr
  SET
    status = p_status::public.role_request_status,
    reviewed_by = v_actor,
    reviewed_at = NOW()
  WHERE rr.id = p_request_id
    AND rr.status = 'pending'::public.role_request_status
  RETURNING rr.* INTO v_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending role request not found: %', p_request_id USING ERRCODE = 'P0002';
  END IF;

  IF p_status = 'approved' THEN
    UPDATE public.user_information ui
    SET role = v_request.requested_role
    WHERE ui.auth_user_id::text = v_request.user_id::text;

    IF NOT FOUND THEN
      INSERT INTO public.user_information (auth_user_id, email, role)
      SELECT au.id::text, au.email, v_request.requested_role
      FROM auth.users au
      WHERE au.id = v_request.user_id
      ON CONFLICT (auth_user_id) DO UPDATE
      SET role = EXCLUDED.role;
    END IF;
  END IF;

  RETURN v_request;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_role_request(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
