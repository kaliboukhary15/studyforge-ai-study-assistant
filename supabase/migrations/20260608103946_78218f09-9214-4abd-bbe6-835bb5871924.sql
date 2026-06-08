
-- Add visual analysis fields to summaries
ALTER TABLE public.summaries
  ADD COLUMN IF NOT EXISTS visual_analysis jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS formulas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tables jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS processing_notes jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Track extracted images per document for inline display
CREATE TABLE IF NOT EXISTS public.document_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  page_number integer,
  caption text,
  ai_description text,
  kind text,
  ordinal integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_images TO authenticated;
GRANT ALL ON public.document_images TO service_role;

ALTER TABLE public.document_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own document images"
ON public.document_images
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS document_images_document_id_idx
  ON public.document_images (document_id, ordinal);
