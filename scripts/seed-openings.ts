/**
 * scripts/seed-openings.ts
 *
 * Seeds openings_catalog and opening_lines in Supabase from the
 * engine-fetched JSON. Safe to re-run — uses upsert.
 * Uses fetch directly to avoid workspace dependency issues.
 *
 * Usage:
 *   npx tsx scripts/seed-openings.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load apps/web/.env.local
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
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'apikey': serviceRoleKey,
  'Authorization': `Bearer ${serviceRoleKey}`,
  'Prefer': 'resolution=merge-duplicates',
};

async function upsert(table: string, rows: object[]): Promise<void> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upsert into ${table} failed (${res.status}): ${body}`);
  }
}

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
  console.log(`Seeding ${openings.length} openings into Supabase...`);

  const catalogRows = openings.map(o => ({
    slug:        o.id,
    eco_code:    o.ecoCode,
    name:        o.name,
    color:       o.color,
    difficulty:  o.difficulty,
    description: o.description,
    tags:        o.tags,
  }));

  await upsert('openings_catalog', catalogRows);
  console.log(`✓ ${catalogRows.length} openings upserted into openings_catalog`);

  const lineRows = openings.flatMap(o =>
    o.lines.map((line, index) => ({
      slug:         line.id,
      opening_slug: o.id,
      name:         line.name,
      description:  line.description ?? null,
      sans:         line.sans,
      sort_order:   index,
    }))
  );

  // Supabase has a default row limit — batch in chunks of 500
  const CHUNK = 500;
  for (let i = 0; i < lineRows.length; i += CHUNK) {
    await upsert('opening_lines', lineRows.slice(i, i + CHUNK));
  }
  console.log(`✓ ${lineRows.length} lines upserted into opening_lines`);

  console.log('\nDone. Supabase is now the source of truth for openings.');
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
