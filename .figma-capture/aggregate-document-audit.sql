SELECT a.id,a.document_status,a.pdf_storage_path,a.docx_storage_path,
  (SELECT jsonb_agg(jsonb_build_object('name',o.name,'size',o.metadata->>'size','mimetype',o.metadata->>'mimetype'))
   FROM storage.objects o WHERE o.bucket_id='evaluation-documents' AND o.name IN (a.pdf_storage_path,a.docx_storage_path)) AS files
FROM public.video_case_aggregates a WHERE a.id='bcf2d2c5-49e9-4a3e-a0f2-b6f6f0928615';
