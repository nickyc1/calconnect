# Package Installation Fixes

## Issue
`npm install` failed with error:
```
npm error notarget No matching version found for @pipedream/sdk@^0.3.0
```

## Root Cause
The `package.json` specified an incorrect version of the Pipedream SDK (`^0.3.0`). The actual latest version is `^2.0.0` (specifically 2.0.10 as of November 2025).

## Fixes Applied

### 1. Updated package.json
**Changed:**
```json
"@pipedream/sdk": "^0.3.0"
```

**To:**
```json
"@pipedream/sdk": "^2.0.0"
```

### 2. Updated lib/pipedream.ts to use correct SDK API

The Pipedream SDK v2.x has a different API structure than initially assumed:

**Import changes:**
```typescript
// OLD (incorrect):
const { PipedreamClient } = require('@pipedream/sdk');

// NEW (correct):
import { createBackendClient } from '@pipedream/sdk/server';
import type { BackendClient } from '@pipedream/sdk/server';
```

**Client initialization changes:**
```typescript
// OLD (incorrect):
new PipedreamClient({
  projectEnvironment: process.env.PIPEDREAM_ENVIRONMENT,
  projectId: process.env.PIPEDREAM_PROJECT_ID,
  clientId: process.env.PIPEDREAM_CLIENT_ID,
  clientSecret: process.env.PIPEDREAM_CLIENT_SECRET
})

// NEW (correct):
createBackendClient({
  environment: process.env.PIPEDREAM_ENVIRONMENT,
  projectId: process.env.PIPEDREAM_PROJECT_ID,
  credentials: {
    clientId: process.env.PIPEDREAM_CLIENT_ID,
    clientSecret: process.env.PIPEDREAM_CLIENT_SECRET
  }
})
```

**Method name changes:**

| Old Method | New Method |
|------------|------------|
| `client.tokens.create()` | `client.createConnectToken()` |
| `client.sources.create()` | `client.deployTrigger()` |
| `client.sources.delete()` | `client.deleteTrigger()` |
| `client.proxy.get()` | `client.makeProxyRequest()` with method: 'GET' |
| `client.proxy.post()` | `client.makeProxyRequest()` with method: 'POST' |
| `client.proxy.delete()` | `client.makeProxyRequest()` with method: 'DELETE' |

**Proxy request structure changes:**
```typescript
// OLD (incorrect):
await client.proxy.get({
  externalUserId,
  accountId,
  url: 'https://...'
});

// NEW (correct):
await client.makeProxyRequest(
  {
    searchParams: {
      external_user_id: externalUserId,
      account_id: accountId
    }
  },
  {
    url: 'https://...',
    options: {
      method: 'GET'
    }
  }
);
```

## References

- **Pipedream SDK npm package**: https://www.npmjs.com/package/@pipedream/sdk
- **SDK Documentation**: https://pipedream.com/docs/connect/api-reference/sdks
- **Backend Client API**: Context7 `/pipedreamhq/pipedream` documentation

## Testing

After these fixes, run:
```bash
npm install
```

This should successfully install all dependencies including `@pipedream/sdk@^2.0.0`.

## Next Steps

1. Verify installation completes successfully
2. Test TypeScript compilation: `npm run build`
3. Start development server: `npm run dev`
4. Create `.env.local` from `.env.example` and configure environment variables

## Deprecation Warnings

When running `npm install`, you'll see deprecation warnings for:
- ESLint 8.x (deprecated, v9 is current)
- Various transitive dependencies (glob, rimraf, inflight)

**These are safe to ignore for now**. See `MAINTENANCE.md` for:
- Full analysis of each warning
- Why we're keeping current versions
- When and how to address them
- Future maintenance schedule

**Summary**: These are deprecation notices, not security vulnerabilities. Functionality is not affected. They'll be addressed in Phase 5-6 or post-launch.

## Notes

- The SDK uses separate entry points for server (`@pipedream/sdk/server`) and browser (`@pipedream/sdk/browser`)
- The server SDK is used for backend operations and includes authentication with OAuth client credentials
- All proxy requests use `makeProxyRequest` regardless of HTTP method (GET/POST/DELETE)
- Installation completed successfully despite deprecation warnings
