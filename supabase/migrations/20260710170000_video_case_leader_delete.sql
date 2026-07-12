-- A case leader can remove reviews and aggregate snapshots for the case they manage.
DROP POLICY IF EXISTS evaluations_delete_case_leader ON public.evaluations;
CREATE POLICY evaluations_delete_case_leader
ON public.evaluations
FOR DELETE
TO authenticated
USING (
  video_case_id IS NOT NULL
  AND (
    public.current_video_case_role(video_case_id) = 'leader'
    OR public.role_at_least('admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS video_case_aggregates_delete_leader ON public.video_case_aggregates;
CREATE POLICY video_case_aggregates_delete_leader
ON public.video_case_aggregates
FOR DELETE
TO authenticated
USING (
  public.current_video_case_role(video_case_id) = 'leader'
  OR public.role_at_least('admin'::public.app_role)
);
