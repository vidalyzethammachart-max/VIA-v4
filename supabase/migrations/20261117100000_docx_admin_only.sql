-- DOCX artifacts are for admin and super_admin only. Everyone else may read PDFs.
-- The edge function document-artifact-url and the UI already hide DOCX; this closes the direct
-- Storage route (createSignedUrl / download) that the preview and my-forms pages used.

-- True when a storage object is a DOCX artifact. The extension check covers new files; the table
-- lookups cover every path the app has recorded, whatever its name (paths come from the n8n workflow).
CREATE OR REPLACE FUNCTION public.is_docx_artifact_path(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    p_name ILIKE '%.docx'
    OR EXISTS (SELECT 1 FROM public.evaluations e WHERE e.docx_storage_path = p_name)
    OR EXISTS (SELECT 1 FROM public.video_case_aggregates a WHERE a.docx_storage_path = p_name)
    OR EXISTS (SELECT 1 FROM public.video_group_evaluations g WHERE g.docx_storage_path = p_name);
$$;

REVOKE ALL ON FUNCTION public.is_docx_artifact_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_docx_artifact_path(text) TO authenticated;

DROP POLICY IF EXISTS evaluation_documents_read_authenticated ON storage.objects;

CREATE POLICY evaluation_documents_read_authenticated
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'evaluation-documents'
  AND (
    public.role_at_least('admin'::public.app_role)
    OR NOT public.is_docx_artifact_path(name)
  )
);
