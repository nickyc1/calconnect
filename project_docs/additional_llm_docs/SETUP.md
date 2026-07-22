# CalConnect Backend Setup Guide

This guide walks you through setting up the CalConnect backend service following the v3 Implementation Plan.

## Phase 0: Infrastructure Setup ✅ COMPLETED

The Next.js project structure has been created with:
- TypeScript configuration
- Project dependencies defined in `package.json`
- Core library files (Pipedream client, Supabase client, Calendar sync service)
- Utility functions (retry logic, error handling)
- Environment variable template (`.env.example`)

## Phase 1: Database Schema Setup

### Step 1: Create Supabase Project

1. Go to [Supabase](https://supabase.com) and create a new project
2. Wait for the project to finish provisioning
3. Note your project URL and keys from Settings > API

### Step 2: Run Database Migration

1. In your Supabase project, navigate to the **SQL Editor**
2. Create a new query
3. Copy the contents of `supabase-schema.sql` and paste into the editor
4. Click "Run" to execute the migration

This will create:
- `users` table - User records with external user ID mapping
- `user_accounts` table - Connected Google Calendar accounts
- `event_mappings` table - Source to mirror event mappings
- `pipedream_sources` table - Deployed Pipedream source tracking
- `webhook_events` table - Webhook deduplication

### Step 3: Verify Schema

Run this query to verify all tables were created:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

You should see:
- `event_mappings`
- `pipedream_sources`
- `user_accounts`
- `users`
- `webhook_events`

## Phase 2: Pipedream Connect Setup

### Step 1: Create Pipedream Project

1. Go to [Pipedream](https://pipedream.com/projects)
2. Create a new project for CalConnect
3. Note your Project ID

### Step 2: Create OAuth Client

1. In your Pipedream project, go to **Connect** > **Settings**
2. Create a new OAuth client
3. Note your Client ID and Client Secret

### Step 3: Configure Environment Variables

1. Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

2. Fill in the values:

```env
# Pipedream Connect Configuration
PIPEDREAM_CLIENT_ID=your_client_id_here
PIPEDREAM_CLIENT_SECRET=your_client_secret_here
PIPEDREAM_PROJECT_ID=proj_xxxxx
PIPEDREAM_ENVIRONMENT=development

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_role_key

# Webhook Security
WEBHOOK_SECRET=generate_a_random_string_here

# Application URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate_another_random_string
```

**Generate random secrets:**
```bash
# On Linux/Mac:
openssl rand -base64 32

# Or use Node.js:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Phase 3: Install Dependencies

```bash
cd calconnect-backend
npm install
```

This will install:
- Next.js and React
- Pipedream SDK (@pipedream/sdk)
- Supabase JS client (@supabase/supabase-js)
- TypeScript and development dependencies

## Phase 4: Start Development Server

```bash
npm run dev
```

The server will start at http://localhost:3000

## Verify Setup

### 1. Check Environment Variables

Create a test endpoint to verify configuration:

```bash
curl http://localhost:3000/api/health
```

### 2. Check Database Connection

The application will attempt to connect to Supabase on startup. Check the console for any connection errors.

### 3. Check Pipedream Connection

The Pipedream client is lazily initialized. It will connect when first used.

## Next Steps

Once setup is complete, you're ready to implement:

- **Phase 2**: Core Backend Services (calendar-sync.ts already created)
- **Phase 3**: API Endpoints (webhook handler, Connect token generation)
- **Phase 4**: User Onboarding Flow (Connect UI, account configuration)
- **Phase 5**: Error Handling & Monitoring
- **Phase 6**: Testing & Deployment

## Troubleshooting

### Database Connection Errors

**Error**: `connection refused`
- Verify SUPABASE_URL is correct
- Check if Supabase project is running
- Verify network connectivity

**Error**: `JWT expired` or `Invalid API key`
- Verify SUPABASE_SERVICE_KEY is correct
- Check if key has expired
- Regenerate keys in Supabase dashboard if needed

### Pipedream Connection Errors

**Error**: `Invalid client credentials`
- Verify PIPEDREAM_CLIENT_ID and PIPEDREAM_CLIENT_SECRET
- Check if OAuth client is active in Pipedream dashboard

**Error**: `Project not found`
- Verify PIPEDREAM_PROJECT_ID is correct
- Check if project exists and is accessible

## Security Notes

⚠️ **Never commit `.env.local` to version control**

The `.gitignore` file already excludes:
- `.env*.local`
- `.env`

Always use environment variables for:
- API keys and secrets
- Database credentials
- OAuth client credentials
- Webhook secrets

## Support

For issues or questions, refer to:
- Implementation Plan: `calconnect_resources/project_docs/CalConnect - Implementation Plan v3 - Connect API Proxy Architecture.md`
- Pipedream Docs: https://pipedream.com/docs
- Supabase Docs: https://supabase.com/docs
