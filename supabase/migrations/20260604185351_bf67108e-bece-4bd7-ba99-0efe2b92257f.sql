ALTER TABLE public.summaries
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS bilingual jsonb;