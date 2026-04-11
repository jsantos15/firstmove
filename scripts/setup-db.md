# Database Setup Instructions

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

## 4. Copy your environment variables

1. Go to **Settings → API**
2. Copy **Project URL** and **anon/public key**
3. Copy them into `apps/web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 5. Generate TypeScript types (after schema is applied)

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_REF > packages/supabase/src/database.types.ts
```

This replaces the hand-written placeholder with auto-generated types that exactly match your schema.
