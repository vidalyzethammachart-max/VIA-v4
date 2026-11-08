-- Case leaders and members cannot read user_information (own row or admin only), so the
-- case page could only show employee numbers. This returns the name and employee number of
-- people who submitted an evaluation in one case, and only to someone who belongs to that
-- case (or an admin). Nothing else about a user (email, role, avatar) leaves the table.
CREATE FUNCTION public.list_case_evaluators(p_video_case_id uuid)
RETURNS TABLE (user_id uuid, full_name text, employee_number text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF coalesce(public.current_video_case_role(p_video_case_id), '') = '' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT u.auth_user_id::uuid, u.full_name, u.employee_number
    FROM public.user_information u
    WHERE u.auth_user_id IN (
      SELECT e.user_id::text FROM public.evaluations e WHERE e.video_case_id = p_video_case_id
    );
END $$;

REVOKE ALL ON FUNCTION public.list_case_evaluators(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_case_evaluators(uuid) TO authenticated;
