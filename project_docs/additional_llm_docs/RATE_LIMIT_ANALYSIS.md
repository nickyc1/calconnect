# Pipedream API Proxy Rate Limit Analysis

**Date:** 2025-12-31
**Incident:** Mirroring functionality failed due to Pipedream API Proxy rate limiting
**Log File:** `logs_result.csv` (21,410 lines)
**Time Window:** 21:24:34 - 21:29:52 UTC (~5 minutes)

---

## Executive Summary

The system hit Pipedream's API Proxy rate limit (1,000 requests / 5 minutes) due to **unbounded RRULE expansion** of recurring events. A single recurring event with `RRULE:FREQ=YEARLY` (no COUNT/UNTIL) was expanded to **7,976 instances**, generating **~31,904 API Proxy POST requests** in under 2 minutes.

**Root Cause:** The `expandRecurringEvent()` function calls `rrule.all()` without any safety limits, causing events with open-ended recurrence rules to generate instances up to year 9999.

**Impact:**
- ✅ Account connection: **Working**
- ❌ Event mirroring: **Failed** (HTTP 429: Throttled)
- ⚠️ Webhook processing: **Partially succeeded** (first ~50 requests succeeded, then rate limited)

---

## Detailed Analysis

### 1. The Numbers

**Timeline:**
- **Start:** 21:24:34 UTC
- **End:** 21:29:52 UTC
- **Duration:** ~5 minutes 18 seconds

**Webhook Volume:**
- **196 total webhooks** received from Pipedream sources
- **25 new events** being created
- **2 recurring events** detected
- **143 recurring instance** webhooks processed

### 2. The Smoking Gun

Found in logs:
```
Creating mirrors for 7976 instances in 2 destination(s)
```

This appeared **twice** (two webhooks for same event), indicating:

**Per Recurring Event:**
- 7,976 instances expanded
- 2 destination accounts
- **15,952 API Proxy POST requests** per recurring event

**Total for Both Events:**
- 15,952 × 2 = **~31,904 API Proxy requests attempted**
- Rate limit: 1,000 requests / 5 minutes
- **Overage: 3,090%** of rate limit

### 3. Root Cause: Unbounded RRULE Expansion

**The Problematic RRULE:**
```
RRULE:FREQ=YEARLY
```

**No COUNT, No UNTIL = Infinite recurrence!**

**What Happened:**
1. Google Calendar sent recurring event with `RRULE:FREQ=YEARLY`
2. Backend code called `rrule.all()` without limits
3. rrule library generated instances from start date (2025) to default max (year 9999)
4. Result: **7,976 yearly instances** (2025-9999 = 7,974 years + 2 extras)
5. For each instance: 2 API Proxy POST calls (one per destination account)
6. Total: 7,976 × 2 = **15,952 API Proxy calls** for ONE event

**Code Location:** `lib/recurring-events.ts:60`
```typescript
// PROBLEM: No limit on instance generation
const instances = rrule.all().map((instanceStart: Date) => {
  // ...
})
```

### 4. API Call Breakdown

**Current Architecture (API Proxy):**

For each source event:
1. **1 API Proxy GET** - Fetch full source event details
2. **N × D API Proxy POSTs** - Create mirrors
   - N = number of instances (1 for non-recurring, potentially thousands for recurring)
   - D = number of destination accounts (typically 2)

**For the failing test:**
- Regular events: 23 events × 1 instance × 2 destinations = 46 POST requests
- Recurring event 1: 1 event × 7,976 instances × 2 destinations = 15,952 POST requests
- Recurring event 2: 1 event × 7,976 instances × 2 destinations = 15,952 POST requests
- **Total: ~31,950 API Proxy requests** (31× the rate limit)

### 5. Why It Failed

**Pipedream API Proxy Rate Limits:**
- **Limit:** 1,000 requests per 5-minute sliding window
- **First ~50 requests:** ✅ Succeeded (200 OK)
- **After ~120 seconds:** ❌ Rate limit hit (429 Throttled)
- **Remaining ~31,850 requests:** ❌ Rejected

**Error Pattern:**
```
Error: TooManyRequestsError
Status code: 429
error: { statusCode: 429, rawBody: 'Throttled\n' }
```

**Rate Limit Headers:**
```http
x-ratelimit-limit: 1000
x-ratelimit-remaining: 0
x-ratelimit-reset: 1767216600
```

---

## Contributing Factors

### 1. ✅ EMIT_EVENTS_ON_DEPLOY=true (Already Fixed)

**Issue:** Deploying sources with `emit_on_deploy=true` caused Pipedream to emit webhooks for ALL existing calendar events immediately on activation.

**Impact:** Multiplied the number of webhooks received in the first few minutes after activation.

**Status:** ✅ **FIXED** - Added `EMIT_EVENTS_ON_DEPLOY=false` environment variable (not yet deployed to production)

### 2. ❌ Unbounded RRULE Expansion (Critical Bug)

**Issue:** `rrule.all()` generates instances without any safety limit.

**Example Scenarios:**
- `RRULE:FREQ=YEARLY` → 7,976 instances (year 2025-9999)
- `RRULE:FREQ=MONTHLY` → ~120,000 instances (120 months/year × 1000 years)
- `RRULE:FREQ=DAILY` → ~2,920,000 instances (365 days/year × 8000 years)

**Status:** ⚠️ **NOT FIXED** - Critical bug requiring immediate attention

### 3. Sequential Instance Processing

**Issue:** Mirrors are created for recurring events one instance at a time in a sequential loop (lines 297-343 in `calendar-sync.ts`).

**Impact:**
```typescript
for (const instance of instances) { // 7,976 iterations
  const mirrorPromises = destAccounts.map(async (dest) => { // 2 parallel per iteration
    await pipedream.createMirrorEvent(...) // API Proxy POST
  })
  await Promise.all(mirrorPromises) // Wait for both before next iteration
}
```

For 7,976 instances:
- ~7,976 sequential iterations
- Each iteration: 2 parallel API calls
- No batching or rate limiting
- Total time: ~8 minutes at 100ms per API call (optimistic)

---

## Solutions

### Solution 1: Add Safety Limits to RRULE Expansion (CRITICAL)

**Implementation:**

```typescript
// lib/recurring-events.ts
export function expandRecurringEvent(event: any, maxInstances: number = 100): RecurringEventInstance[] {
  if (!event.recurrence || event.recurrence.length === 0) {
    return []
  }

  try {
    const rruleString = event.recurrence.find((r: string) => r.startsWith('RRULE:'))
    if (!rruleString) {
      console.warn('No RRULE found in recurrence array:', event.recurrence)
      return []
    }

    // Parse the RRULE
    const rrule = rrulestr(rruleString, {
      dtstart: new Date(event.start.dateTime || event.start.date),
      forceset: false
    })

    // CRITICAL FIX: Use .all(maxInstances) or .between() with time limit
    // Option 1: Limit by count
    const instances = rrule.all((date, i) => {
      return i < maxInstances // Stop after maxInstances
    }).map((instanceStart: Date) => {
      // ... rest of expansion logic
    })

    // Option 2: Limit by time window (e.g., next 2 years)
    const now = new Date()
    const twoYearsFromNow = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate())
    const instances = rrule.between(now, twoYearsFromNow, true).map((instanceStart: Date) => {
      // ... rest of expansion logic
    })

    if (instances.length >= maxInstances) {
      console.warn(`Recurring event ${event.id} limited to ${maxInstances} instances (may have more)`)
    }

    console.log(`Expanded recurring event ${event.id} to ${instances.length} instances`)
    return instances
  } catch (error) {
    console.error('Error expanding recurring event:', error)
    return []
  }
}
```

**Recommendation:**
- **Max instances:** 100-365 (configurable via environment variable)
- **Time window:** 1-2 years from activation date
- **Hybrid:** Use both limits (whichever is smaller)

### Solution 2: Implement Batch Processing for Recurring Events

**Current:** Sequential instance processing
**Proposed:** Batch instances in groups

```typescript
// Process in batches of 50 instances
const BATCH_SIZE = 50
for (let i = 0; i < instances.length; i += BATCH_SIZE) {
  const batch = instances.slice(i, i + BATCH_SIZE)

  // Process all instances in batch in parallel
  const batchPromises = batch.flatMap(instance =>
    destAccounts.map(dest => createMirrorEvent(...))
  )

  await Promise.all(batchPromises)

  // Add rate limit protection between batches
  if (i + BATCH_SIZE < instances.length) {
    await sleep(1000) // 1 second between batches
  }
}
```

### Solution 3: Implement Client-Side Rate Limiting

Add exponential backoff and retry logic:

```typescript
// utils/rate-limiter.ts
class RateLimiter {
  private queue: Array<() => Promise<any>> = []
  private processing = false
  private requestsPerWindow = 900 // Leave buffer below 1000 limit
  private windowMs = 5 * 60 * 1000 // 5 minutes
  private requestTimestamps: number[] = []

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Remove timestamps outside current window
    const now = Date.now()
    this.requestTimestamps = this.requestTimestamps.filter(
      ts => now - ts < this.windowMs
    )

    // If at limit, wait until oldest timestamp expires
    if (this.requestTimestamps.length >= this.requestsPerWindow) {
      const oldestTs = this.requestTimestamps[0]
      const waitMs = this.windowMs - (now - oldestTs)
      await sleep(waitMs)
    }

    // Execute and track
    this.requestTimestamps.push(Date.now())
    return await fn()
  }
}
```

---

## Alternative: Pipedream Actions

### Current Approach: API Proxy (Direct HTTP Requests)

**Pros:**
- Simple implementation
- Direct control over HTTP requests

**Cons:**
- Each API call counts against 1,000 req/5min limit
- No batching or optimization
- Can't group operations

### Proposed: Pipedream Actions (Code Execution)

**What are Actions?**
Pipedream Actions are serverless functions that run on Pipedream infrastructure. You invoke them with parameters, and they execute code that can make multiple API calls internally.

**Pricing:**
- **1 credit per 30 seconds** of compute time at base processing power
- Credits more expensive than individual API Proxy requests at low volume
- More economical at high volume (batch operations)

**Example Action for Batch Mirror Creation:**

```javascript
// Hypothetical Pipedream Action: create-batch-mirrors
export default defineAction({
  name: "Create Batch Mirror Events",
  description: "Create multiple calendar mirror events in one invocation",
  props: {
    google_calendar: { type: "app", app: "google_calendar" },
    mirrors: {
      type: "array",
      description: "Array of mirror event specifications"
    }
  },
  async run({ steps, $ }) {
    const results = []

    // All these API calls happen WITHIN one action invocation
    for (const mirror of this.mirrors) {
      try {
        const event = await $.google_calendar.createEvent({
          calendarId: mirror.calendarId,
          resource: mirror.eventData
        })
        results.push({ success: true, eventId: event.id })
      } catch (error) {
        results.push({ success: false, error: error.message })
      }
    }

    return { results, count: results.length }
  }
})
```

**Usage from Backend:**

```typescript
// Instead of 15,952 API Proxy calls...
for (const instance of instances) {
  for (const dest of destAccounts) {
    await pipedream.proxy.post(...) // 15,952 separate requests
  }
}

// ...Make 1 Action invocation with all data
const response = await pipedream.actions.invoke({
  action: "create-batch-mirrors",
  externalUserId: userId,
  params: {
    mirrors: instances.flatMap(instance =>
      destAccounts.map(dest => ({
        calendarId: dest.calendar_id,
        eventData: { /* mirror event data */ }
      }))
    ) // 15,952 mirrors in one array
  }
})
```

**Cost Comparison:**

| Approach | Volume | Cost |
|----------|--------|------|
| **API Proxy** | 15,952 requests | **BLOCKED** (hits rate limit at 1,000) |
| **Actions** | 1 invocation (~8 min compute) | 16 credits (8 min ÷ 0.5 min/credit) |
| **Actions (Batched)** | 160 invocations (100 mirrors each, 5s each) | 160 credits (much higher cost) |

**Limitations of Actions:**
1. **Not currently available for Connect use cases** - Actions are designed for personal workflows, not multi-tenant SaaS
2. **Maximum execution time** - 5-10 minutes typically
3. **No guaranteed rate limit exemption** - Google Calendar API still has its own limits
4. **Complexity** - Need to build and maintain custom actions

---

## Recommended Immediate Actions

### Priority 1: Fix Unbounded RRULE Expansion (CRITICAL)

1. ✅ Add `MAX_RECURRING_INSTANCES` environment variable (default: 100)
2. ✅ Update `expandRecurringEvent()` to limit instance generation
3. ✅ Add warning logs when events are truncated
4. ✅ Consider time-based limits (e.g., next 1-2 years only)

**Impact:** Prevents future rate limit incidents from recurring events

### Priority 2: Deploy EMIT_EVENTS_ON_DEPLOY=false

1. ✅ Add environment variable to Vercel production
2. ✅ Redeploy application

**Impact:** Reduces initial webhook flood when activating mirroring

### Priority 3: Add Rate Limiting Protection

1. ✅ Implement client-side rate limiter
2. ✅ Add delays between batch processing
3. ✅ Add exponential backoff on 429 errors

**Impact:** Graceful handling of rate limits, better resilience

### Priority 4: Improve User Experience

1. ✅ Add progress tracking for large recurring events
2. ✅ Show estimated mirror count before activation
3. ✅ Warn users about very large recurring events
4. ✅ Add option to skip mirroring of recurring events beyond X instances

---

## Long-Term Considerations

### Option A: Lazy Instance Creation

Instead of creating all instances upfront, create instances on-demand:

**Approach:**
1. Store only the base recurring event in `event_mappings`
2. When webhook arrives for an instance, check if mirror exists
3. If not, create mirror on-demand

**Pros:**
- Minimal API calls upfront
- Only creates mirrors for instances that actually occur

**Cons:**
- More complex logic
- Potential race conditions
- Delayed mirror creation

### Option B: Periodic Sync Job

Run a scheduled job to sync upcoming instances:

**Approach:**
1. Daily/weekly job checks for recurring events
2. Expands instances for next 30-90 days
3. Creates missing mirrors incrementally

**Pros:**
- Spread API calls over time
- Better rate limit management

**Cons:**
- Delayed mirroring for newly added recurring events
- More infrastructure complexity

### Option C: Hybrid Approach

Combine immediate + lazy + periodic:

1. **Immediate:** Create next 10-30 instances on event creation
2. **Lazy:** Create additional instances on-demand when webhook arrives
3. **Periodic:** Background job ensures upcoming instances are mirrored

---

## Conclusion

The rate limit failure was caused by:
1. **Primary:** Unbounded RRULE expansion generating 7,976 instances
2. **Secondary:** All existing events emitted on source deployment
3. **Tertiary:** No rate limiting or batch processing

**Immediate fix:** Add safety limits to `expandRecurringEvent()` (max 100-365 instances)

**Short-term:** Deploy `EMIT_EVENTS_ON_DEPLOY=false` to production

**Long-term:** Evaluate lazy instance creation or Pipedream Actions if scaling beyond 100 instances per recurring event

**Actions are NOT a silver bullet** - they won't help with this specific issue since the problem is volume, not rate limits. Actions still make the same underlying Google Calendar API calls, just batched into fewer Pipedream invocations.
