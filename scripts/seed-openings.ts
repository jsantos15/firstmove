/**
 * scripts/seed-openings.ts
 *
 * Seeds openings_catalog and opening_lines in Supabase from the
 * engine-fetched JSON. Safe to re-run — uses upsert.
 *
 * Usage:
 *   npx tsx scripts/seed-openings.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (already present).
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local manually (no extra deps needed)
const envPath = path.join(__dirname, '..', 'apps', 'web', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

interface FetchedLine {
  id: string;
  name: string;
  description?: string;
  sans: string[];
}

interface FetchedOpening {
  id: string;
  ecoCode: string;
  name: string;
  color: string;
  difficulty: string;
  description: string;
  tags: string[];
  lines: FetchedLine[];
}

const inputPath = path.join(__dirname, 'output', 'openings-fetched.json');
const openings: FetchedOpening[] = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

async function seed() {
  console.log(`Seeding ${openings.length} openings...`);

  // ── Upsert openings_catalog ──────────────────────────────────────────────
  const catalogRows = openings.map(o => ({
    slug:        o.id,
    eco_code:    o.ecoCode,
    name:        o.name,
    color:       o.color,
    difficulty:  o.difficulty,
    description: o.description,
    tags:        o.tags,
  }));

  const { error: catalogError } = await supabase
    .from('openings_catalog')
    .upsert(catalogRows, { onConflict: 'slug' });

  if (catalogError) {
    console.error('Failed to upsert openings_catalog:', catalogError.message);
    process.exit(1);
  }
  console.log(`✓ ${catalogRows.length} openings upserted into openings_catalog`);

  // ── Upsert opening_lines ─────────────────────────────────────────────────
  const lineRows = openings.flatMap(o =>
    o.lines.map((line, index) => ({
      slug:         line.id,
      opening_slug: o.id,
      name:         line.name,
      description:  line.description ?? null,
      sans:         line.sans,
      sort_order:   index,  // 0 = main line
    }))
  );

  const { error: linesError } = await supabase
    .from('opening_lines')
    .upsert(lineRows, { onConflict: 'opening_slug,slug' });

  if (linesError) {
    console.error('Failed to upsert opening_lines:', linesError.message);
    process.exit(1);
  }
  console.log(`✓ ${lineRows.length} lines upserted into opening_lines`);

  console.log('\nDone. Supabase is now the source of truth for openings.');
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
