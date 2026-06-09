ALTER TABLE public.summaries
  ADD COLUMN IF NOT EXISTS quick_overview text,
  ADD COLUMN IF NOT EXISTS key_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS memory_aids jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS comprehension_check jsonb NOT NULL DEFAULT '{}'::jsonb;