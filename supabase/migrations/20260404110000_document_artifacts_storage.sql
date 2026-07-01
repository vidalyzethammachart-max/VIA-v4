ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS source_doc_id text NULL,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text NULL,
  ADD COLUMN IF NOT EXISTS docx_storage_path text NULL;

CREATE INDEX IF NOT EXISTS evaluations_pdf_storage_path_idx
  ON public.evaluations (pdf_storage_path)
  WHERE pdf_storage_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS evaluations_docx_storage_path_idx
  ON public.evaluations (docx_storage_path)
  WHERE docx_storage_path IS NOT NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('evaluation-documents', 'evaluation-documents', false)
ON CONFLICT (id) DO NOTHING;
