-- Role request system: table + RLS + admin review flow
create extension if not exists pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_request_status') THEN
    CREATE TYPE public.role_request_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.role_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_role public.app_role NOT NULL,
  status public.role_request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  CONSTRAINT role_requests_review_consistency CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR
    (status IN ('approved', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_role_requests_user_created_at
  ON public.role_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_role_requests_status_created_at
  ON public.role_requests(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_role_requests_pending_per_user
  ON public.role_requests(user_id)
  WHERE status = 'pending';

ALTER TABLE public.role_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_requests_insert_own ON public.role_requests;
DROP POLICY IF EXISTS role_requests_select_own_or_admin ON public.role_requests;
DROP POLICY IF EXISTS role_requests_update_admin ON public.role_requests;

CREATE POLICY role_requests_insert_own
ON public.role_requests
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND status = 'pending'::public.role_request_status
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
);

CREATE POLICY role_requests_select_own_or_admin
ON public.role_requests
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.role_at_least('admin'::public.app_role)
);

CREATE POLICY role_requests_update_admin
ON public.role_requests
FOR UPDATE
TO authenticated
USING (public.role_at_least('admin'::public.app_role))
WITH CHECK (public.role_at_least('admin'::public.app_role));

GRANT SELECT, INSERT, UPDATE ON public.role_requests TO authenticated;

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

CREATE OR REPLACE FUNCTION public.guard_user_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.role() = 'service_role' THEN
      RETURN NEW;
    END IF;

    IF auth.uid() IS NULL OR NOT public.role_at_least('admin'::public.app_role) THEN
      RAISE EXCEPTION 'Only admins can change user roles' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_user_role_changes ON public.user_information;
CREATE TRIGGER trg_guard_user_role_changes
BEFORE UPDATE OF role ON public.user_information
FOR EACH ROW
EXECUTE FUNCTION public.guard_user_role_changes();
