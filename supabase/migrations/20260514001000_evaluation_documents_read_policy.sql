INSERT INTO storage.buckets (id, name, public)
VALUES ('evaluation-documents', 'evaluation-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS evaluation_documents_read_authenticated ON storage.objects;

CREATE POLICY evaluation_documents_read_authenticated
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'evaluation-documents');
