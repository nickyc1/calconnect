# Supabase Database Setup

## Quick Start

### For New Projects
1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Run `migrations/001_initial_schema.sql` in the SQL Editor
3. Run `migrations/002_webhook_connect_flow.sql` in the SQL Editor

### For Existing Projects
If you already have tables from the initial setup:
1. Run **only** `migrations/002_webhook_connect_flow.sql` in the SQL Editor
2. This will add the `connect_tokens` table and restructure existing tables

## Migration Files

Migrations are numbered in ascending order and should be run sequentially:

- `001_initial_schema.sql` - Initial database schema (baseline)
- `002_webhook_connect_flow.sql` - Webhook-based Connect flow updates

## How to Apply Migrations

1. Open your Supabase project dashboard
2. Navigate to: **SQL Editor** → **New Query**
3. Copy the contents of the migration file
4. Paste into the SQL Editor
5. Click **Run** or press `Ctrl/Cmd + Enter`
6. Check for success message

## Database Schema Overview

### Core Tables

- **`connect_tokens`** - Temporary Connect token → userId mappings (POC only)
- **`users`** - Optional user table (not required for POC)
- **`user_accounts`** - Connected Pipedream accounts (Google Calendar)
- **`pipedream_sources`** - Deployed Pipedream sources for event monitoring
- **`event_mappings`** - Maps source events to mirrored events
- **`webhook_events`** - Webhook event log for debugging

### Key Relationships

```
connect_tokens (temporary)
  └─> Maps connect_token to user_id

user_accounts
  └─> Stores Pipedream account_id per user

pipedream_sources
  └─> References user_accounts.account_id
  └─> Tracks deployed event sources

event_mappings
  └─> Maps source events to mirror events
```

## Environment Variables Required

After setting up your database, update `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Find these in: **Project Settings** → **API**

## Troubleshooting

### "relation already exists" errors
This is normal if you're running migrations on an existing database. The migrations use `IF NOT EXISTS` to prevent errors.

### Foreign key constraint violations
Make sure you run migrations in order. Migration 002 depends on tables created in 001.

### Permission errors
Ensure you're using the `service_role` key in your backend, not the `anon` key.

## Row Level Security (RLS)

RLS is **disabled** for the POC to simplify development.

**For production:** Re-enable RLS and create policies based on your authentication strategy.
