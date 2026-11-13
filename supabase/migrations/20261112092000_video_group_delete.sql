-- Allow a video group's creator (or an admin) to delete it.
-- video_group_evaluation_sources rows go away via ON DELETE CASCADE; the source
-- evaluations themselves are untouched. A group whose document is being generated
-- ('pending') cannot be deleted, so a late n8n callback never targets a missing row.

DROP POLICY IF EXISTS video_group_evaluations_delete_owner_or_admin
  ON public.video_group_evaluations;

CREATE POLICY video_group_evaluations_delete_owner_or_admin
ON public.video_group_evaluations
FOR DELETE
TO authenticated
USING (
  document_status <> 'pending'
  AND (
    requested_by = auth.uid()
    OR public.role_at_least('admin'::public.app_role)
  )
);

NOTIFY pgrst, 'reload schema';
