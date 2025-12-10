# Pipedream SDK API Corrections

**Date:** November 8, 2025
**SDK Version:** @pipedream/sdk v2.2.0

## Issue
Our initial implementation used outdated/incorrect API methods from Context7 documentation that don't match the actual Pipedream SDK v2.2.0 API.

## Corrections Applied

### 1. Client Instantiation

**Before (Incorrect - from Context7 docs):**
```typescript
import { createBackendClient } from '@pipedream/sdk/server';

const client = createBackendClient({
  environment: 'development',
  projectId: '...',
  credentials: {
    clientId: '...',
    clientSecret: '...'
  }
});
```

**After (Correct - from SDK README):**
```typescript
import { PipedreamClient } from '@pipedream/sdk';

const client = new PipedreamClient({
  clientId: process.env.PIPEDREAM_CLIENT_ID!,
  clientSecret: process.env.PIPEDREAM_CLIENT_SECRET!,
  projectEnvironment: 'development' | 'production',
  projectId: process.env.PIPEDREAM_PROJECT_ID!
});
```

### 2. Connect Token Generation

**Before:**
```typescript
await client.createConnectToken({ externalUserId })
```

**After:**
```typescript
await client.tokens.create({ external_user_id: externalUserId })
```

### 3. Deploy Triggers (Sources)

**Before:**
```typescript
await client.deployTrigger({
  externalUserId,
  triggerId: 'google_calendar-new-or-updated-event-instant',
  configuredProps: {...},
  webhookUrl
})
```

**After:**
```typescript
await client.triggers.deploy({
  id: 'google_calendar-new-or-updated-event-instant',
  external_user_id: externalUserId,
  configured_props: {...},
  webhook_url: webhookUrl
})
```

### 4. Delete Triggers

**Before:**
```typescript
await client.deleteTrigger({
  id: sourceId,
  externalUserId
})
```

**After:**
```typescript
await client.deployedTriggers.delete(sourceId, {
  external_user_id: externalUserId
})
```

### 5. Proxy Requests (CRITICAL CHANGE)

**Before (makeProxyRequest - doesn't exist):**
```typescript
await client.makeProxyRequest(
  {
    searchParams: {
      external_user_id: externalUserId,
      account_id: accountId
    }
  },
  {
    url: 'https://googleapis.com/...',
    options: {
      method: 'GET'
    }
  }
)
```

**After (proxy.get/post/delete with base64-encoded URLs):**
```typescript
const url64 = Buffer.from('https://googleapis.com/...').toString('base64');

// GET
await client.proxy.get(url64, {
  external_user_id: externalUserId,
  account_id: accountId
});

// POST
await client.proxy.post(url64, {
  external_user_id: externalUserId,
  account_id: accountId,
  body: {...}
});

// DELETE
await client.proxy.delete(url64, {
  external_user_id: externalUserId,
  account_id: accountId
});
```

## Key Differences Summary

| Aspect | Old API (Context7) | New API (SDK v2.2.0) |
|--------|-------------------|---------------------|
| **Import** | `createBackendClient` from `/server` | `PipedreamClient` from main export |
| **Init** | `environment` param | `projectEnvironment` param |
| **Tokens** | `createConnectToken()` | `tokens.create()` |
| **Triggers** | `deployTrigger()` | `triggers.deploy()` |
| **Proxy** | `makeProxyRequest()` | `proxy.get/post/delete()` |
| **URL Encoding** | Not required | **Base64 required** |
| **Param Names** | camelCase (`externalUserId`) | snake_case (`external_user_id`) |

## Critical: Base64 URL Encoding

The SDK **requires** base64-encoded URLs for all proxy requests:

```typescript
// Helper method added to PipedreamService
private encodeUrl(url: string): string {
  return Buffer.from(url).toString('base64');
}
```

## References

- **SDK README**: `/node_modules/@pipedream/sdk/README.md`
- **API Reference**: `/node_modules/@pipedream/sdk/reference.md`
- **Package**: `@pipedream/sdk` v2.2.0
- **Updated File**: `mircal_backend/lib/pipedream.ts`
- **Documentation**: `CLAUDE.md` (Pipedream SDK v2.x section added)

## Impact

- ✅ All methods now match official SDK v2.2.0 API
- ✅ TypeScript types properly imported
- ✅ Base64 encoding implemented for proxy requests
- ✅ Parameter names updated to snake_case
- ✅ Error handling uses `PipedreamError` class

## Testing

After these corrections, the implementation should work with actual Pipedream Connect API calls. Test with:

1. Generate connect token
2. Deploy a trigger for a test user
3. Make proxy requests to Google Calendar API
4. Verify base64 encoding works correctly
