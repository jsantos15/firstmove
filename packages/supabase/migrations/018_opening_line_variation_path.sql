-- Persist source variation hierarchy so clients can render deeper opening trees
-- without splitting learner-facing course cards.

alter table public.opening_lines
  add column if not exists variation_path text[],
  add column if not exists variation_depth integer;

create index if not exists opening_lines_variation_path_idx
  on public.opening_lines using gin (variation_path);

notify pgrst, 'reload schema';
