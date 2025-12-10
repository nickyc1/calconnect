# MirCal Backend

Multi-tenant calendar mirroring service using Pipedream Connect and Supabase.

**Repository:** git@github.com:mh550/mircal-backend.git

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Database
1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run migrations from `supabase/migrations/` in order:
   - For new projects: Run both `001_initial_schema.sql` and `002_webhook_connect_flow.sql`
   - For existing projects: Run only `002_webhook_connect_flow.sql`

See [supabase/README.md](./supabase/README.md) for detailed instructions.

### 3. Configure Environment
```bash
cp .env.example .env.local
```

Fill in your credentials:
- **Pipedream**: Client ID, Secret, Project ID (from [pipedream.com/projects](https://pipedream.com/projects))
- **Supabase**: URL, Anon Key, Service Role Key (from Project Settings → API)
- **Webhook**: ngrok URL for local development

### 4. Start Development Server
```bash
npm run dev
```

Visit **http://localhost:3000/test** to test the POC.

## Architecture

- **Next.js 14** - App Router for API endpoints
- **Pipedream Connect** - Managed OAuth & API proxy
- **Supabase** - PostgreSQL database
- **TypeScript** - Type-safe development

## Project Structure

```
mircal_backend/
├── app/
│   ├── api/
│   │   ├── connect/         # Connect token & webhook callback
│   │   ├── deploy-source/   # Deploy Pipedream sources
│   │   └── webhook/         # Calendar event webhooks
│   └── test/                # Test UI (POC)
├── lib/
│   ├── pipedream.ts         # Pipedream SDK wrapper
│   ├── supabase.ts          # Supabase client
│   ├── calendar-sync.ts     # Mirror event logic
│   └── types.ts             # TypeScript definitions
├── supabase/
│   ├── migrations/          # Database migrations
│   └── README.md            # Database setup guide
└── docs/                    # Project documentation
```

## Testing the POC

### Using ngrok for Webhooks

1. **Install ngrok**:
   ```bash
   # macOS/Linux
   brew install ngrok

   # Or download from https://ngrok.com/download
   ```

2. **Start ngrok tunnel**:
   ```bash
   ngrok http 3000
   ```

3. **Copy the forwarding URL** (e.g., `https://abc123.ngrok-free.dev`)

4. **Update `.env.local`**:
   ```env
   WEBHOOK_BASE_URL=https://abc123.ngrok-free.dev
   ```

5. **Restart your dev server**

### Test Flow

1. Go to http://localhost:3000/test
2. Click "Generate Token"
3. Click the Connect URL to authorize Google Calendar
4. Pipedream sends webhook → Account saved automatically!
5. Check server logs: "Account connected successfully"
6. Query Supabase to find your `account_id`
7. Paste Account ID and click "Deploy Source"
8. Create a test event in Google Calendar
9. Watch webhooks and database for mirror events

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/connect/token` | POST | Generate Pipedream Connect token |
| `/api/connect/callback` | POST | Webhook for account connections |
| `/api/deploy-source` | POST | Deploy Pipedream calendar source |
| `/api/webhook` | POST | Receive calendar event notifications |

## Documentation

- **[Setup Guide](./docs/SETUP.md)** - Detailed setup instructions
- **[Database Guide](./supabase/README.md)** - Database setup and migrations
- **[SDK Fixes](./docs/SDK_CORRECTIONS.md)** - Pipedream SDK corrections
- **[Maintenance](./docs/MAINTENANCE.md)** - Dependency maintenance notes

## Development

### Running Tests
```bash
npm test
```

### Building for Production
```bash
npm run build
npm start
```

### Environment Variables

Required in `.env.local`:

```env
# Pipedream Connect
PIPEDREAM_CLIENT_ID=
PIPEDREAM_CLIENT_SECRET=
PIPEDREAM_PROJECT_ID=
PIPEDREAM_ENVIRONMENT=development

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Webhooks
WEBHOOK_BASE_URL=  # ngrok URL for local dev

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Key Features

✅ **Webhook-based account connection** - No manual Account ID copying
✅ **Multi-account support** - Users can connect multiple Google Calendars
✅ **Automated event mirroring** - Privacy-preserving "Busy" events
✅ **Database migrations** - Version-controlled schema changes
✅ **TypeScript** - Type-safe development

## Implementation Status

- [x] Infrastructure setup
- [x] Database schema with migrations
- [x] Pipedream Connect integration
- [x] Webhook-based account connection
- [x] Calendar source deployment
- [ ] Event mirroring logic (in progress)
- [ ] Error handling and retry logic
- [ ] Testing and deployment

## Troubleshooting

### "Connect Link URL doesn't work"
- Make sure you're using the `connectLinkUrl` from the API response
- Append `&app=google_calendar` to the URL
- Check that Pipedream project is in the correct environment (development/production)

### "Webhook not receiving account connection"
- Verify ngrok is running and URL is in `.env.local`
- Check `WEBHOOK_BASE_URL` has no trailing slash
- Look at server console for webhook POST logs
- Check Supabase `connect_tokens` table has your token

### "Database errors"
- Run migrations in order (001, then 002)
- Use `SUPABASE_SERVICE_ROLE_KEY`, not anon key
- Check Supabase project is active and accessible

See [docs/SETUP.md](./docs/SETUP.md) for more troubleshooting.

## License

Private - Client Project
