# scripts/ — Context

## Purpose
Build, deploy, and database automation scripts and documentation.

## What lives here
- **`setup-db.md`** — Step-by-step instructions for setting up the Supabase project and running migrations

## Rules
- Any script that deploys to staging requires confirmation in chat before running
- Any script that deploys to production requires explicit user approval — never auto-run
- Never store credentials or secrets in scripts — always read from environment variables
