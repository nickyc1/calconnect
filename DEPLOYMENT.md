# MirCal - Vercel Deployment Instructions

This guide walks through deploying MirCal to Vercel for production use.

---

## Prerequisites (Already Completed by Client)

Before starting deployment, ensure you have:

1. ✅ **Google OAuth Client Created**
   - Created in Google Cloud Console
   - OAuth consent screen configured
   - Authorized JavaScript origins configured
   - Redirect URIs configured
   - Client ID and Client Secret saved

2. ✅ **Supabase Project Transferred**
   - Project transferred to client's Supabase workspace
   - Client has owner access
   - Database contains all migrations (001-007)

---

## Part 1: Supabase Configuration

### 1.1 Configure Google OAuth Provider

**Location:** Supabase Dashboard → Authentication → Providers → Google

1. Enable Google provider
2. Enter your Google OAuth credentials:
   - **Client ID**: Your Google OAuth Client ID
   - **Client Secret**: Your Google OAuth Client Secret

### 1.2 Update Site URL and Redirect URLs

**Location:** Supabase Dashboard → Authentication → URL Configuration

1. **Site URL**: `https://your-vercel-domain.vercel.app`
   - This is where users are redirected after login

2. **Redirect URLs** (add these to the allowlist):
   - `https://your-vercel-domain.vercel.app/auth/callback`
   - `https://your-vercel-domain.vercel.app/**` (for dev previews)

### 1.3 Update Google OAuth Redirect URIs

**Location:** Google Cloud Console → APIs & Services → Credentials → Your OAuth Client

Add these authorized redirect URIs:
- `https://[your-supabase-project-ref].supabase.co/auth/v1/callback`
- `https://your-vercel-domain.vercel.app/auth/callback`

**Example:**
```
https://ajnbnqvawgtewyyrnmno.supabase.co/auth/v1/callback
https://mircal-production.vercel.app/auth/callback
```

### 1.4 Update Google OAuth Authorized JavaScript Origins

**Location:** Google Cloud Console → APIs & Services → Credentials → Your OAuth Client

Add these origins:
- `https://your-vercel-domain.vercel.app`
- `https://[your-supabase-project-ref].supabase.co`

---

## Part 2: Pipedream Configuration

### 2.1 Create Production Environment (if not exists)

**Location:** Pipedream Dashboard → Your Project → Environments

1. Create a new environment named `production`
2. Note the environment ID

### 2.2 Verify or Create Project Credentials

**Location:** Pipedream Dashboard → Projects → Your Project → Settings

You'll need:
- **Project ID**: Found in project settings
- **Client ID**: API credentials for your project
- **Client Secret**: API credentials for your project

If you don't have API credentials yet:
1. Go to Project Settings → API Keys
2. Click "Create API Key"
3. Save the Client ID and Client Secret

---

## Part 3: Environment Variables for Vercel

### 3.1 Required Environment Variables

Configure these in Vercel Dashboard → Your Project → Settings → Environment Variables:

```env
# Pipedream Connect
PIPEDREAM_CLIENT_ID=your_pipedream_client_id
PIPEDREAM_CLIENT_SECRET=your_pipedream_client_secret
PIPEDREAM_PROJECT_ID=your_pipedream_project_id
PIPEDREAM_ENVIRONMENT=production

# Pipedream Source Deployment Settings
# Whether to emit events for existing calendar entries when sources are deployed
# Set to 'false' to prevent webhook flood on activation (RECOMMENDED)
# Set to 'true' only if you want to process all existing events on activation
EMIT_EVENTS_ON_DEPLOY=false

# Polling interval for deleted/cancelled events source (in seconds)
# Default: 300 seconds (5 minutes)
# Lower values = more frequent checks = higher API usage
# Higher values = less frequent checks = delayed deletion detection
DELETED_EVENTS_POLL_INTERVAL_SECONDS=300

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Application URLs
NEXT_PUBLIC_APP_URL=https://your-vercel-domain.vercel.app
WEBHOOK_BASE_URL=https://your-vercel-domain.vercel.app
```

### 3.2 Where to Find Supabase Credentials

**Location:** Supabase Dashboard → Project Settings → API

- **Project URL**: Copy to `NEXT_PUBLIC_SUPABASE_URL`
- **anon/public key**: Copy to `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role key**: Copy to `SUPABASE_SERVICE_ROLE_KEY`
  - ⚠️ **IMPORTANT**: Keep service role key secret, never expose to client

### 3.3 Important Notes

- ✅ Set all variables for **Production** environment
- ✅ Optionally set for **Preview** if you want preview deployments to work
- ❌ **DO NOT** add Google OAuth Client ID/Secret here - those go in Supabase Dashboard
- ⚠️ **Never commit** `.env.local` to version control

---

## Part 4: Vercel Deployment

### 4.1 Connect Repository to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New Project"
3. Import your GitHub repository: `mh550/mircal-backend`
4. Select the repository

### 4.2 Configure Build Settings

**Framework Preset**: Next.js (should auto-detect)

**Build & Development Settings:**
- Build Command: `npm run build` (default)
- Output Directory: `.next` (default)
- Install Command: `npm install` (default)

**Root Directory**: Leave as `.` (root of repo)

### 4.3 Add Environment Variables

1. Expand "Environment Variables" section
2. Add all variables from Part 3.1 above
3. Set environment to "Production"

### 4.4 Deploy

1. Click "Deploy"
2. Wait for build to complete (2-5 minutes)
3. Note your deployment URL: `https://your-project-name.vercel.app`

### 4.5 Update Environment Variables with Production URL

After first deployment, update these variables with your actual Vercel URL:

```env
NEXT_PUBLIC_APP_URL=https://your-actual-vercel-url.vercel.app
WEBHOOK_BASE_URL=https://your-actual-vercel-url.vercel.app
```

Then redeploy (Vercel will auto-redeploy on env var changes).

---

## Part 5: Database Migrations

### 5.1 Verify All Migrations Are Applied

**Location:** Supabase Dashboard → Database → Migrations

Verify these migrations exist and are applied:
- ✅ `001_initial_schema.sql`
- ✅ `002_webhook_connect_flow.sql`
- ✅ `003_add_source_type.sql`
- ✅ `004_mvp_enhancements.sql`
- ✅ `005_mvp_enhancements_fixed.sql`
- ✅ `006_multiple_sources_and_cleanup.sql`
- ✅ `007_recurring_events_support.sql`

### 5.2 Run Missing Migrations (if needed)

If any migrations are missing:

**Location:** Supabase Dashboard → SQL Editor

1. Copy contents of missing migration file from `supabase/migrations/`
2. Paste into SQL Editor
3. Click "Run"
4. Verify no errors

**Order matters** - run migrations in numerical order (001, 002, 003, etc.)

---

## Part 6: Post-Deployment Verification

### 6.1 Test User Authentication

1. Visit `https://your-vercel-domain.vercel.app`
2. Should redirect to `/login`
3. Click "Sign in with Google"
4. Complete OAuth flow
5. Should redirect to `/dashboard`

**If login fails:**
- Check Supabase logs: Dashboard → Logs → Auth
- Verify Google OAuth redirect URIs are correct
- Check browser console for errors

### 6.2 Test Account Connection

1. On dashboard, click "Connect Google Calendar"
2. Should open Pipedream Connect popup
3. Complete Google Calendar OAuth
4. Account should appear in dashboard

**If connection fails:**
- Check Pipedream environment is set to `production`
- Verify `WEBHOOK_BASE_URL` is correct
- Check Vercel logs: Dashboard → Deployments → [Latest] → Functions

### 6.3 Test Mirroring

1. Connect 2-3 Google Calendar accounts
2. Set one account as source (checkbox)
3. Click "Enable Mirroring"
4. Should see "Mirroring enabled" success message
5. Create event in source calendar
6. Wait 5-10 seconds
7. Verify mirror appears in destination calendar(s)

**If mirroring fails:**
- Check Vercel function logs for webhook errors
- Verify Supabase service role key is correct
- Check Pipedream sources are deployed: Pipedream Dashboard → Sources

### 6.4 Test Recurring Events

1. Create recurring event in source calendar (e.g., weekly for 4 weeks)
2. Verify correct number of mirrors created (e.g., 4 instances × N destinations)
3. Wait 15+ minutes
4. Verify NO duplicate mirrors appear
5. Delete one instance
6. Verify only that instance's mirrors deleted

**If duplicates appear:**
- Check server logs for "already mapped, skipping" message
- Verify Migration 007 is applied
- Check `event_mappings` table for base event marker

---

## Part 7: Monitoring and Maintenance

### 7.1 Monitor Vercel Logs

**Location:** Vercel Dashboard → Your Project → Logs

Monitor for:
- Webhook errors (should be 200 OK)
- Database errors
- Pipedream API errors

### 7.2 Monitor Supabase Logs

**Location:** Supabase Dashboard → Logs

Monitor:
- **API Logs**: Check for database errors
- **Auth Logs**: Check for login failures
- **Postgres Logs**: Check for query errors

### 7.3 Monitor Pipedream Sources

**Location:** Pipedream Dashboard → Sources

Verify:
- Sources are active and healthy
- No error states
- Events are being received

### 7.4 Database Backups

**Location:** Supabase Dashboard → Database → Backups

- Supabase automatically backs up Pro tier projects daily
- For Free tier: Set up manual backups
- Test restore process periodically

---

## Part 8: Troubleshooting

### Issue: "Login redirects to localhost"

**Cause:** `NEXT_PUBLIC_APP_URL` still points to localhost

**Fix:**
1. Update `NEXT_PUBLIC_APP_URL` in Vercel env vars
2. Redeploy

### Issue: "Webhooks not working"

**Cause:** `WEBHOOK_BASE_URL` incorrect or sources deployed with old URL

**Fix:**
1. Verify `WEBHOOK_BASE_URL` in Vercel env vars
2. Disable and re-enable mirroring (redeploys sources with new URL)

### Issue: "Database connection errors"

**Cause:** Service role key incorrect or expired

**Fix:**
1. Get fresh service role key from Supabase Dashboard
2. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel
3. Redeploy

### Issue: "Pipedream API errors"

**Cause:** Client credentials incorrect or environment mismatch

**Fix:**
1. Verify `PIPEDREAM_ENVIRONMENT=production`
2. Check client ID/secret are for correct project
3. Verify project has production environment

### Issue: "Duplicate recurring events"

**Cause:** Migration 007 not applied or base event marker logic missing

**Fix:**
1. Run Migration 007 in Supabase SQL Editor
2. Verify code has Bug #10 fix (lines 362-383 in `lib/calendar-sync.ts`)
3. Disable and re-enable mirroring to create fresh markers

---

## Part 9: Custom Domain (Optional)

### 9.1 Add Custom Domain in Vercel

**Location:** Vercel Dashboard → Your Project → Settings → Domains

1. Click "Add Domain"
2. Enter your domain (e.g., `mircal.yourdomain.com`)
3. Follow Vercel's DNS configuration instructions

### 9.2 Update Configuration

After domain is active, update these locations:

1. **Vercel Environment Variables:**
   ```env
   NEXT_PUBLIC_APP_URL=https://mircal.yourdomain.com
   WEBHOOK_BASE_URL=https://mircal.yourdomain.com
   ```

2. **Supabase Site URL:**
   - Dashboard → Authentication → URL Configuration
   - Update Site URL to `https://mircal.yourdomain.com`

3. **Supabase Redirect URLs:**
   - Add `https://mircal.yourdomain.com/auth/callback`

4. **Google OAuth:**
   - Add to Authorized JavaScript Origins: `https://mircal.yourdomain.com`
   - Add to Redirect URIs: `https://mircal.yourdomain.com/auth/callback`

5. **Redeploy** to apply changes

---

## Checklist

Before going live, verify:

- [ ] Google OAuth configured in Google Cloud Console
- [ ] Google OAuth credentials added to Supabase Dashboard
- [ ] All redirect URIs updated in Google Cloud Console
- [ ] All environment variables set in Vercel
- [ ] Supabase Site URL and Redirect URLs updated
- [ ] All 7 database migrations applied in Supabase
- [ ] Vercel deployment successful
- [ ] User login works
- [ ] Account connection works
- [ ] Mirroring activation works
- [ ] Event creation creates mirrors
- [ ] Event deletion removes mirrors
- [ ] Recurring events work correctly (no duplicates)
- [ ] Logs show no errors in Vercel and Supabase

---

## Support

For issues during deployment:
- Check Vercel function logs for API errors
- Check Supabase logs for database errors
- Verify all environment variables are set correctly
- Test each component independently (auth → connect → mirroring)

For production issues:
- Monitor Vercel Analytics for errors
- Set up Vercel log drains for long-term monitoring
- Configure Supabase alerting for database issues
