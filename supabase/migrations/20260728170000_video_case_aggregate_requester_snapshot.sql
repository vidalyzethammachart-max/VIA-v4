ALTER TABLE public.video_case_aggregates
  ADD COLUMN IF NOT EXISTS requested_by_name text NULL,
  ADD COLUMN IF NOT EXISTS requested_by_employee_number text NULL;

CREATE OR REPLACE FUNCTION public.snapshot_video_case_aggregate_requester()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  requester_name text;
  requester_employee_number text;
BEGIN
  SELECT
    NULLIF(trim(profile.full_name), ''),
    NULLIF(trim(profile.employee_number), '')
  INTO requester_name, requester_employee_number
  FROM public.user_information profile
  WHERE profile.auth_user_id::text = NEW.requested_by::text
  LIMIT 1;

  NEW.requested_by_name := COALESCE(
    NULLIF(trim(NEW.requested_by_name), ''),
    requester_name
  );
  NEW.requested_by_employee_number := COALESCE(
    NULLIF(trim(NEW.requested_by_employee_number), ''),
    requester_employee_number
  );

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.snapshot_video_case_aggregate_requester()
FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_snapshot_video_case_aggregate_requester
ON public.video_case_aggregates;

CREATE TRIGGER trg_snapshot_video_case_aggregate_requester
BEFORE INSERT
ON public.video_case_aggregates
FOR EACH ROW
EXECUTE FUNCTION public.snapshot_video_case_aggregate_requester();

UPDATE public.video_case_aggregates aggregate
SET
  requested_by_name = COALESCE(
    NULLIF(trim(aggregate.requested_by_name), ''),
    NULLIF(trim(profile.full_name), '')
  ),
  requested_by_employee_number = COALESCE(
    NULLIF(trim(aggregate.requested_by_employee_number), ''),
    NULLIF(trim(profile.employee_number), '')
  )
FROM public.user_information profile
WHERE profile.auth_user_id::text = aggregate.requested_by::text
  AND (
    NULLIF(trim(aggregate.requested_by_name), '') IS NULL
    OR NULLIF(trim(aggregate.requested_by_employee_number), '') IS NULL
  );

DROP POLICY IF EXISTS video_case_aggregates_delete_leader
ON public.video_case_aggregates;

CREATE POLICY video_case_aggregates_delete_leader
ON public.video_case_aggregates
FOR DELETE
TO authenticated
USING (
  public.current_video_case_role(video_case_id) = 'leader'
  OR public.role_at_least('admin'::public.app_role)
);

NOTIFY pgrst, 'reload schema';
