ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS document_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (document_status IN ('pending', 'ready', 'failed')),
  ADD COLUMN IF NOT EXISTS document_error TEXT NULL;

CREATE INDEX IF NOT EXISTS evaluations_document_status_idx
  ON public.evaluations (document_status, created_at DESC);

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evaluations_insert_own ON public.evaluations;
DROP POLICY IF EXISTS evaluations_select_own_or_editor ON public.evaluations;
DROP POLICY IF EXISTS evaluations_update_admin_only ON public.evaluations;

CREATE POLICY evaluations_insert_own
ON public.evaluations
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND google_doc_id IS NULL
  AND document_status = 'pending'
  AND document_error IS NULL
);

CREATE POLICY evaluations_select_own_or_editor
ON public.evaluations
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.role_at_least('editor'::public.app_role)
);

CREATE POLICY evaluations_update_admin_only
ON public.evaluations
FOR UPDATE
TO authenticated
USING (public.role_at_least('admin'::public.app_role))
WITH CHECK (public.role_at_least('admin'::public.app_role));

GRANT SELECT, INSERT, UPDATE ON public.evaluations TO authenticated;
