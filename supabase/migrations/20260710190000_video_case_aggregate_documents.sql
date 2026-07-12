ALTER TABLE public.video_case_aggregates
  ADD COLUMN IF NOT EXISTS document_status text NOT NULL DEFAULT 'pending'
    CHECK (document_status IN ('pending', 'ready', 'failed')),
  ADD COLUMN IF NOT EXISTS document_error text NULL,
  ADD COLUMN IF NOT EXISTS source_doc_id text NULL,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text NULL,
  ADD COLUMN IF NOT EXISTS docx_storage_path text NULL;
