# packages/supabase - Context

## Purpose
All Supabase-related code shared across the monorepo: the client instance, auth helpers, database query functions, schema migrations, and generated TypeScript types.

## What lives here
- **`src/client.ts`** - Single Supabase client instance (import this, never create your own)
- **`src/auth.ts`** - Auth helpers: sign in, sign up, sign out, get current user
- **`src/database.types.ts`** - TypeScript types matching the Supabase schema
- **`src/queries/`** - Typed query functions per domain (progress, repertoires, etc.)
- **`migrations/`** - SQL migration files applied to the Supabase project

## Naming Conventions
- **Query files:** domain name - `progress.ts`, `repertoires.ts`, `favorites.ts`
- **Query functions:** verb + noun - `getUserVariationProgress`, `upsertVariationProgress`, `createRepertoire`
- **Migration files:** `NNN_description.sql` - `001_initial_schema.sql`, `002_variation_progress.sql`

## Adding New Queries
1. Create or edit the appropriate file in `src/queries/`
2. Use the typed `Database` interface for all Supabase calls
3. Always throw errors (don't return null silently) so TanStack Query can catch them
4. Export from `src/index.ts`

## Schema Changes
1. Write a new migration file in `migrations/` with the next sequence number
2. Update `src/database.types.ts` so it matches the active migrations exactly, ideally by re-running the Supabase CLI type generator (see `scripts/setup-db.md`)
3. Update query functions as needed
4. Never alter the production database directly - always through a migration file

## Key Rules
- Never commit actual secret keys - the client reads from environment variables only
- Never create a second Supabase client - always import from `./client`
- Row-level security is enforced at the DB level - never try to filter by user in queries as a substitute for RLS
- Prefer regenerating `database.types.ts` from Supabase when possible; if you must patch it manually, keep it aligned with the active migrations and follow up with regeneration later
