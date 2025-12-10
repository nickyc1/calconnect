# Database Migration Guide

## Applying Migration 002 to Your Existing Database

If you already have a Supabase project with tables from the initial setup, follow these steps to apply the webhook-based Connect flow updates.

### Step 1: Back Up Your Data (Recommended)

Before running any migration, back up your existing data:

1. In Supabase dashboard, go to **Database** → **Backups**
2. Click **Create Backup** or note the automatic backup time
3. Alternatively, export your data manually:
   ```sql
   -- Export existing data
   SELECT * FROM user_accounts;
   SELECT * FROM pipedream_sources;
   SELECT * FROM event_mappings;
   ```

### Step 2: Run Migration 002

1. Open your Supabase project dashboard
2. Navigate to: **SQL Editor** → **New Query**
3. Copy the entire contents of `supabase/migrations/002_webhook_connect_flow.sql`
4. Paste into the SQL Editor
5. Click **Run** or press `Ctrl/Cmd + Enter`

### Step 3: Verify Migration

Check that the migration completed successfully:

```sql
-- Should show 'connect_tokens' table
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'connect_tokens';

-- Should show updated columns in user_accounts
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'user_accounts'
ORDER BY ordinal_position;
```

Expected `user_accounts` columns after migration:
- `id` (uuid)
- `user_id` (text) ← Changed from UUID
- `account_id` (text) ← Renamed from pipedream_account_id
- `app_name` (text) ← New
- `account_display_name` (text) ← New
- `is_active` (boolean) ← New
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### Step 4: Clean Up Old Data (Optional)

The migration removes several columns from `user_accounts`. If you had data in those columns, it's permanently removed:
- `account_email` (removed)
- `account_name` (removed → replaced by `account_display_name`)
- `is_source` (removed)
- `calendar_id` (removed)
- `color_id` (removed)

**Note**: This is acceptable for POC. For production, you'd want to migrate data to new columns first.

### Step 5: Update Your Environment

If your `.env.local` still references old variable names, update it:

```env
# Update these:
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here  # Note: not SUPABASE_SERVICE_KEY
```

### Step 6: Restart Your Application

```bash
npm run dev
```

## Troubleshooting Migration Issues

### Error: "column does not exist"

**Cause**: Migration tried to rename a column that doesn't exist.

**Solution**: This likely means your database schema differs from what the migration expects. You may need to:
1. Check your current schema
2. Manually adjust the migration to match your current state
3. Or start fresh with a new database

### Error: "constraint does not exist"

**Cause**: Migration tried to drop a constraint that doesn't exist.

**Solution**: Safe to ignore. The migration uses `IF EXISTS` clauses, but some constraints may have different names.

### Error: "foreign key violation"

**Cause**: You have data referencing old column names or relationships.

**Solution**:
1. Check which table is causing the issue
2. Clear related data or update references manually
3. For POC, easiest is to clear tables and start fresh

### Starting Fresh (Nuclear Option)

If migration fails and you don't have critical data:

1. **Drop all tables**:
   ```sql
   DROP TABLE IF EXISTS webhook_events CASCADE;
   DROP TABLE IF EXISTS event_mappings CASCADE;
   DROP TABLE IF EXISTS pipedream_sources CASCADE;
   DROP TABLE IF EXISTS user_accounts CASCADE;
   DROP TABLE IF EXISTS connect_tokens CASCADE;
   DROP TABLE IF EXISTS users CASCADE;
   ```

2. **Run migrations in order**:
   - First: `001_initial_schema.sql`
   - Then: `002_webhook_connect_flow.sql`

## Rolling Back Migration

If you need to roll back to the previous schema:

**⚠️ Warning**: This will delete the `connect_tokens` table and restructure other tables. **Data loss will occur.**

```sql
-- Drop connect_tokens table
DROP TABLE IF EXISTS connect_tokens CASCADE;

-- Restore old user_accounts structure (manual - data will be lost)
DROP TABLE IF EXISTS user_accounts CASCADE;

CREATE TABLE user_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pipedream_account_id TEXT NOT NULL UNIQUE,
  account_email TEXT NOT NULL,
  account_name TEXT,
  is_source BOOLEAN DEFAULT false,
  calendar_id TEXT NOT NULL,
  color_id TEXT DEFAULT '1',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, calendar_id)
);
```

## Best Practices for Future Migrations

1. **Always back up before migrating**
2. **Test migrations on a staging database first**
3. **Run migrations during low-traffic periods**
4. **Monitor logs during and after migration**
5. **Have a rollback plan ready**
6. **Document any manual steps required**

## Need Help?

If you encounter issues:
1. Check the error message carefully
2. Search for the error in Supabase docs or Discord
3. Review the migration SQL to understand what it's doing
4. For POC, consider starting fresh if migration fails
