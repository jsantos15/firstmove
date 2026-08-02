# Database Setup Instructions

## Current development target

During active development, the entire FirstMove app and the opening-course
pipeline use the local Supabase stack. Supabase Cloud is retained as the future
production target, but normal development commands must not read or write it.

Start the local stack, then configure both apps from the credentials reported by
the Supabase CLI:

```powershell
supabase start
pnpm supabase:configure-local-apps
pnpm supabase:check-local-apps
```

The configuration command:

- writes the local API URL and public key to `apps/web/.env.local`;
- writes a LAN-reachable local API URL and public key to
  `apps/mobile/.env.local` for Expo on a physical device;
- preserves an existing cloud web profile in
  `apps/web/.env.cloud.local`; and
- never copies a service-role or secret key into a client environment.

Both app environment files and the cloud backup are gitignored. Root `pnpm dev`,
`pnpm dev:web`, and `pnpm dev:mobile` refresh this local configuration before
starting. Direct workspace development commands fail if their app environment
does not point to local Supabase.

`scripts/.env` remains the pipeline source of truth and must use
`http://127.0.0.1:54321` plus the local secret/service-role key. Do not run
`supabase db reset` while generated opening data needs to be preserved.

When FirstMove is ready for production, provision adequate Supabase Cloud
capacity, migrate the approved local data, replace the deployment environment
values with cloud URL/public keys, and explicitly revise the local-only
development guards and documentation.

## Cloud production setup

Follow these steps once to set up your Supabase project.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New Project**
3. Name it `firstmove`, choose a region close to you, set a database password
4. Wait ~2 minutes for the project to provision

## 2. Run the initial migration

1. In your Supabase project dashboard, go to **SQL Editor**
2. Open `packages/supabase/migrations/001_initial_schema.sql`
3. Paste the entire contents into the SQL Editor
4. Click **Run**

## 3. Set up authentication

1. Go to **Authentication → Providers**
2. Enable **Email** (on by default)
3. Enable **Google**: you'll need a Google Cloud OAuth client ID and secret
   - Create one at [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
   - Authorized redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
4. For iOS App Store: enable **Apple** sign-in later when preparing for App Store submission

## 4. Copy your production environment variables

1. Go to **Settings → API**
2. Copy **Project URL** and **anon/public key**
3. Store them in the deployment environment when preparing to go live. Do not
   replace the current local development files while the temporary local-only
   workflow is active:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

An intentional future cloud pipeline run would require a separate, explicit
cloud configuration and `FIRSTMOVE_ALLOW_CLOUD_PIPELINE=1`. The normal
development `scripts/.env` must remain local.

The future cloud script configuration would include:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
LICHESS_API_TOKEN=your-lichess-personal-token
```

## 5. Generate TypeScript types (after schema is applied)

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_REF > packages/supabase/src/database.types.ts
```

This replaces the hand-written placeholder with auto-generated types that exactly match your schema.
