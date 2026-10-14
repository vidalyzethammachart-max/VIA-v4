WITH scores AS (
  SELECT 'evaluation' kind,e.id::text id,e.document_status,e.pdf_storage_path,e.docx_storage_path,
    count(*) questions,min(v.value::numeric) minimum,max(v.value::numeric) maximum
  FROM public.evaluations e CROSS JOIN LATERAL jsonb_each(e.rubric) s CROSS JOIN LATERAL jsonb_each_text(s.value) v
  WHERE e.id IN (244,245,246,247) GROUP BY e.id
  UNION ALL
  SELECT 'aggregate',a.id::text,a.document_status,a.pdf_storage_path,a.docx_storage_path,
    count(*),min(v.value::numeric),max(v.value::numeric)
  FROM public.video_case_aggregates a CROSS JOIN LATERAL jsonb_each(a.combined_scores) s CROSS JOIN LATERAL jsonb_each_text(s.value) v
  WHERE a.id='dfc81cac-ea57-4bcc-9785-7aba9bf32795' GROUP BY a.id
)
SELECT kind,id,questions,minimum,maximum,document_status,
  (SELECT jsonb_agg(jsonb_build_object('name',o.name,'size',o.metadata->>'size','mimetype',o.metadata->>'mimetype'))
   FROM storage.objects o WHERE o.bucket_id='evaluation-documents' AND o.name IN (scores.pdf_storage_path,scores.docx_storage_path)) files
FROM scores ORDER BY kind,id;
