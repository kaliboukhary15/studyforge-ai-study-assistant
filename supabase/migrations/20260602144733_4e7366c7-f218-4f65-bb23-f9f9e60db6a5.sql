
ALTER TABLE public.summaries
  ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'intermediate',
  ADD COLUMN IF NOT EXISTS examples jsonb,
  ADD COLUMN IF NOT EXISTS analogies jsonb,
  ADD COLUMN IF NOT EXISTS visuals jsonb,
  ADD COLUMN IF NOT EXISTS practice jsonb,
  ADD COLUMN IF NOT EXISTS notes text;
