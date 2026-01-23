# MirCal - Future Optimizations for Production & Scale

This document outlines optimizations to implement as MirCal moves to production and scales. These improvements focus on reducing Pipedream credit usage, improving user experience, and enabling more granular control.

---

## 1. Batch Mirrored Event Operations (HIGH PRIORITY)

### Current State
Mirrored event creation/update/deletion happens **individually** via the Connect API Proxy. Each operation costs **1 Pipedream credit** per mirrored event.


App -> Connect API Proxy -> Google Calendar API (1 event at a time)

Actions can be used to batch operations.

App -> Custom Action (batched operations) -> Google Calendar API (multiple events at once)

**Cost Example:**
- Single event update mirrored to 3 calendars: `1 (source invocation) + 3 (updates) = 4 credits`
- Recurring event (5 instances) update to 3 calendars: `1 (source) + (3 calendars × 5 instances) = 16 credits`

Since recurring event instances are mapped individually, credit usage scales linearly with instance count and destination calendar count.

#### Example:

Recurring event of 5 instances mirrored to 3 calendars:

Currently, each instance is SEPARATELY mirrored to the other calendars.

This could be addressed by instead of mirroring each instance, mirroring the entire recurring event to each calendar.  The recurring event would need to be expanded to include all instances, and then mirrored to each calendar.  This would be a more expensive operation up front, but would save credits in the long run.

### Proposed Optimization
Create a **custom Pipedream Action** that consolidates multiple Google Calendar API calls into a single execution. This would:
- Accept batch parameters (multiple destination accounts, calendar IDs, event data)
- Execute all API calls within a single Pipedream compute instance
- Return aggregate results

**Pricing Impact:**
- Actions charge **1 credit per 30 seconds** of compute time (base tier)
- Even with 15 API calls, likely completes in <30s → **1 credit instead of 16**

### Implementation Considerations
- **Multi-Account Challenge**: Need to verify Pipedream Actions can authenticate to N different Google accounts in single execution
  - If Actions use `this.google_calendar.$auth`, may only support one account
  - Alternative: Pass OAuth tokens as parameters (security concern)
  - **Research Required**: Review Pipedream Actions source code for multi-account patterns
- **Error Handling**: One failed API call shouldn't abort entire batch
- **Retry Logic**: Implement per-request retry with exponential backoff
- **Response Mapping**: Return clear success/failure status per destination

### Estimated Impact
- **Credit Reduction**: 75-90% for multi-calendar, recurring event scenarios
- **Complexity**: Medium (custom action development + testing)
- **Priority**: HIGH - Direct cost savings for every user operation

---

## 2. Instant Deletion Source (MEDIUM PRIORITY)

### Current State
Event deletions use **polling-based source** (`event-cancelled`) that checks every 5 minutes. This means:
- Deleted events take up to 5 minutes to sync
- Polling runs even when no events deleted (wasted credits)
- User experience feels "laggy" compared to instant creation notifications

### Proposed Optimization
Migrate to **instant push notifications** for deletions, matching the behavior of `new-or-updated-event-instant`.

### Implementation Considerations
- **Research Required**:
  - Review Pipedream's `event-cancelled` source code to understand why it uses polling
  - Investigate Google Calendar API: Does it send push notifications for `status: "cancelled"` events?
  - Check if `new-or-updated-event-instant` already receives deletion notifications (as `status: "cancelled"`)
- **Potential Solution**:
  - If Google sends cancellations via push, modify backend webhook handler to detect `status === "cancelled"`
  - Remove polling source entirely, rely only on instant source
- **Fallback**: If push notifications don't reliably deliver deletions, keep polling as backup but increase interval

### Estimated Impact
- **Credit Reduction**: Eliminate continuous polling costs
- **UX Improvement**: Instant deletion sync (matches creation/update speed)
- **Complexity**: Medium (requires understanding Google Calendar push notification behavior)
- **Priority**: MEDIUM - UX improvement + cost savings, but deletions less frequent than creates

---

## 3. Developer Dashboard (HIGH PRIORITY)

### Current State
No admin interface for monitoring or controlling Pipedream operations. Settings like polling intervals are hardcoded in source configurations.

### Proposed Features

#### 3.1 Settings Management
- **Polling Interval Configuration**: Adjust cancelled event source polling (e.g., 5min → 10min for lower volume users)
- **Batch Size Limits**: Cap how many mirrors created per operation (safety valve)
- **Retry Configuration**: Control retry attempts and backoff timing
- **Per-User Settings**: Override defaults for specific users (e.g., VIP users get faster polling)

#### 3.2 Emergency Master Shutoff
- **"Kill Switch" Button**: Immediately stop all Pipedream credit-consuming operations
- **Implementation**:
  - Add `system_enabled BOOLEAN DEFAULT true` to Supabase config table
  - All webhook handlers check this flag before processing
  - Dashboard endpoint to toggle flag
  - Display banner in user dashboard when system disabled
- **Use Cases**:
  - Runaway billing event
  - Detected security breach
  - Critical bug causing incorrect mirroring

#### 3.3 Monitoring & Analytics
- **Credit Usage Dashboard**: Real-time view of Pipedream credit consumption
  - Per-user breakdown
  - Per-operation type (create/update/delete)
  - Historical trends
- **Error Tracking**: Failed operations, retry counts, permanent failures
- **Source Health**: Monitor Pipedream source status, webhook delivery rates

### Implementation Considerations
- **Tech Stack**: Next.js admin routes with authentication (separate from user dashboard)
- **Database**: Add `system_config` and `user_config` tables to Supabase
- **Real-time Updates**: Use Supabase Realtime for live credit usage monitoring
- **Security**: Require admin authentication, log all configuration changes

### Estimated Impact
- **Operational Control**: Ability to respond to incidents in real-time
- **Cost Optimization**: Tune settings based on actual usage patterns
- **Complexity**: High (full dashboard application)
- **Priority**: HIGH - Critical for production operations and cost control

---

## 4. Improved Initial Sync for Existing Events (MEDIUM PRIORITY)

### Current State
Initial sync relies on Pipedream source's `emit_on_deploy` option, which:
- May have limitations on batch size
- Fires webhook for every existing event (credit-intensive)
- No control over date range (syncs all events or nothing)
- Can overwhelm system if user has thousands of events

### Proposed Optimization
Implement **dedicated initial sync endpoint** that:
1. User triggers initial sync via dashboard button
2. Backend calls Google Calendar API directly to fetch events in configurable range
3. Batch processes events (e.g., 50 at a time) to create mirrors
4. Shows progress indicator to user
5. Stores sync completion status per calendar

**Date Range Strategy:**
- Default: Next 4 weeks + past 1 week (captures upcoming events + recent events)
- Configurable: User can select "Sync all future events" or custom range
- Exclude: Events more than 1 year in past (likely not relevant)

### Implementation Considerations
- **Pagination**: Google Calendar API returns max 2500 events per request, use `pageToken`
- **Rate Limiting**: Implement exponential backoff, respect Google's quota (1,000,000 requests/day)
- **Progress Tracking**: Store sync state in database, allow resumption if interrupted
- **Batch Optimization**: Group mirror creation API calls (see Optimization #1)
- **User Experience**:
  - Show progress bar: "Syncing... 150/500 events"
  - Allow cancellation
  - Send email when complete for large syncs

### Estimated Impact
- **UX Improvement**: Users control when/what to sync
- **Cost Reduction**: Only sync relevant events, not entire history
- **Reliability**: Better error handling than source's `emit_on_deploy`
- **Complexity**: Medium (API integration + job queue)
- **Priority**: MEDIUM - Needed for production, but workarounds exist (manual event creation)

---

## 5. Per-Source Mirroring Configuration (LOW PRIORITY)

### Current State
When user designates accounts as sources:
- Each source calendar mirrors to **ALL** other connected calendars
- No granular control over which sources mirror to which destinations
- Users cannot exclude specific calendars from receiving mirrors

**Example Current Behavior:**
- User has 3 calendars: Work, Personal, Family
- All 3 set as sources
- Event in Work mirrors to Personal + Family
- Event in Personal mirrors to Work + Family
- Event in Family mirrors to Work + Personal

### Proposed Optimization
Introduce **`mirroring_configurations`** table for per-source-calendar destination mapping.

#### Database Schema
```sql
CREATE TABLE mirroring_configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_account_id TEXT NOT NULL,
  source_calendar_id TEXT NOT NULL,
  destination_mappings JSONB NOT NULL, -- Array of { account_id, calendar_id, color_id }
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, source_account_id, source_calendar_id)
);

-- Example destination_mappings:
[
  { "account_id": "apn_456", "calendar_id": "primary", "color_id": "1" },
  { "account_id": "apn_789", "calendar_id": "primary", "color_id": "2" }
]
```

#### User Experience
**Dashboard UI Changes:**
- Each source calendar gets "Configure Destinations" button
- Modal shows checkboxes for all available destination calendars
- User selects which calendars should receive mirrors from this source
- Can set different color_id per destination

**Example Configuration:**
```
Work Calendar (source) →
  ✓ Personal Calendar (color: red)
  ✓ Family Calendar (color: blue)
  ✗ Archive Calendar

Personal Calendar (source) →
  ✓ Work Calendar (color: green)
  ✗ Family Calendar
  ✗ Archive Calendar
```

#### Backend Changes
- **Webhook Handler**: Instead of querying `user_accounts WHERE is_source_account = false`, query `mirroring_configurations WHERE source_calendar_id = <event_calendar>`
- **API Endpoints**:
  - `POST /api/mirroring-config` - Create/update configuration
  - `GET /api/mirroring-config/:accountId/:calendarId` - Get configuration
  - `DELETE /api/mirroring-config/:id` - Remove configuration
- **Migration**: Backfill existing users with default configs (all-to-all)

### Implementation Considerations
- **Backward Compatibility**: Ensure existing users continue working during migration
- **Validation**: Prevent circular dependencies or invalid account references
- **Performance**: Index on `(user_id, source_account_id, source_calendar_id)` for fast lookups
- **UI Complexity**: Configuration UI must be intuitive, not overwhelming

### Estimated Impact
- **Flexibility**: Power users can fine-tune mirroring behavior
- **Privacy**: Users can exclude sensitive calendars from certain mirrors
- **Complexity**: Medium (database migration + UI + API changes)
- **Priority**: LOW - Current "all sources → all destinations" works for MVP, this is V2 feature

---

## 6. Development Environment (HIGH PRIORITY)

### Current State
Only production deployment on Vercel. All code changes go directly to production, increasing risk of:
- Bugs reaching users
- Incorrect Pipedream configurations deployed
- Database migration failures in production

### Proposed Optimization
Create **separate development instance** with full environment isolation.

#### Infrastructure Setup
**Vercel:**
- `mircal-webapp-dev.vercel.app` (development)
- `mircal-webapp.vercel.app` (production)

**Supabase:**
- Development project with separate database
- Seed data for testing multi-account scenarios
- Branch deployments for PR previews

**Pipedream:**
- Separate `development` environment (already supported via `PIPEDREAM_ENVIRONMENT`)
- Test users use development OAuth apps
- Development sources send webhooks to dev backend

#### Workflow
1. **Feature Development**: Work on `dev` branch, deploy to dev environment
2. **Testing**: Test with dev Pipedream sources + dev Supabase
3. **PR Review**: Preview deployment for code review
4. **Merge to Main**: Auto-deploy to production after tests pass

#### Environment Variables Management
```bash
# .env.development
PIPEDREAM_ENVIRONMENT=development
NEXT_PUBLIC_SUPABASE_URL=https://dev-project.supabase.co
WEBHOOK_BASE_URL=https://mircal-webapp-dev.vercel.app

# .env.production
PIPEDREAM_ENVIRONMENT=production
NEXT_PUBLIC_SUPABASE_URL=https://prod-project.supabase.co
WEBHOOK_BASE_URL=https://mircal-webapp.vercel.app
```

### Implementation Considerations
- **Cost**: Running two Supabase projects (dev can use free tier)
- **Data Isolation**: Ensure dev never touches production data
- **Testing**: Create automated test suite that runs in dev environment
- **CI/CD**: GitHub Actions for automated deployments
  - Dev deploys on push to `dev` branch
  - Prod deploys on merge to `main`

### Estimated Impact
- **Risk Reduction**: Catch bugs before production
- **Confidence**: Test Pipedream integrations safely
- **Developer Experience**: Faster iteration without fear of breaking production
- **Complexity**: Low (Vercel + Supabase support this natively)
- **Priority**: HIGH - Should be done BEFORE major feature work

---

## Implementation Priority Matrix

| Optimization | Priority | Complexity | Impact | Estimated Effort |
|-------------|----------|------------|--------|------------------|
| **Development Environment** | HIGH | Low | High | 4 hours |
| **Developer Dashboard** | HIGH | High | High | 40 hours |
| **Batch Operations** | HIGH | Medium | Very High | 20 hours |
| **Instant Deletion Source** | MEDIUM | Medium | Medium | 12 hours |
| **Improved Initial Sync** | MEDIUM | Medium | Medium | 16 hours |
| **Per-Source Configuration** | LOW | Medium | Medium | 24 hours |

---

## Recommended Roadmap

### Phase 1: Foundation (Before Scaling)
1. Set up development environment (4 hours)
2. Build basic developer dashboard with credit monitoring (20 hours)
3. Implement emergency shutoff switch (4 hours)

**Total:** ~28 hours | **Goal:** Operational visibility and control

### Phase 2: Cost Optimization (As Users Scale)
1. Implement batch mirrored event operations (20 hours)
2. Research and implement instant deletion source (12 hours)

**Total:** ~32 hours | **Goal:** Reduce per-user operational costs by 75%+

### Phase 3: Feature Maturity (V2 Product)
1. Improved initial sync with progress tracking (16 hours)
2. Per-source mirroring configuration (24 hours)
3. Enhanced developer dashboard (20 hours)

**Total:** ~60 hours | **Goal:** Production-grade feature set

---

## Cost-Benefit Analysis

### Current Costs (Per User, Per Month)
**Assumptions:**
- 3 connected calendars (all sources)
- 10 events created/updated per day
- 2 events deleted per day
- 30% of events are recurring (avg 5 instances)

**Credit Usage:**
- **Event Creates**: 10 events × 30 days × (1 source + 2 mirrors) × 1.45 (recurring factor) = **1,305 credits**
- **Event Deletes**: 2 events × 30 days × (1 source + 2 mirrors) × 1.45 = **261 credits**
- **Polling Source**: ~8,640 invocations/month = **8,640 credits**

**Total: ~10,206 credits/user/month**

### After Optimizations
**Batch Operations + Instant Deletion:**
- **Event Creates**: 10 × 30 × 1 (batch) × 1.45 = **435 credits** (67% reduction)
- **Event Deletes**: 2 × 30 × 1 (batch) × 1.45 = **87 credits** (67% reduction)
- **Polling Source**: 0 credits (replaced with instant) = **0 credits** (100% reduction)

**Total: ~522 credits/user/month (95% reduction)**

### Pipedream Pricing Impact
At scale (1,000 users):
- **Before**: 10,206,000 credits/month → **~$1,020/month** (at $0.0001/credit)
- **After**: 522,000 credits/month → **~$52/month** (at $0.0001/credit)

**Monthly Savings: $968** | **Annual Savings: $11,616**

---

## Monitoring & Success Metrics

Track these KPIs to measure optimization impact:

1. **Credit Usage per User** (target: <600 credits/month after optimizations)
2. **P95 Mirror Sync Latency** (target: <5 seconds for creates, <10 seconds for deletes)
3. **Error Rate** (target: <0.1% permanent failures)
4. **Initial Sync Completion Rate** (target: >95% of users complete sync)
5. **API Cost per User** (target: <$0.10/month)

---

*Last Updated: 2024-12-31*
