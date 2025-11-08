# MirCal Backend

MirCal backend service built with Next.js, Pipedream Connect API Proxy, and Supabase for multi-tenant calendar mirroring.

**Repository:** git@github.com:mh550/mircal-backend.git

## Architecture

- **Next.js 14**: App Router for API endpoints and frontend
- **Pipedream Connect**: Managed OAuth and API proxy for Google Calendar
- **Supabase**: PostgreSQL database for event mappings and user configuration
- **TypeScript**: Type-safe development

## Project Structure

```
mircal_backend/
├── app/
│   ├── api/
│   │   ├── webhook/          # Webhook handler for Pipedream sources
│   │   ├── connect/          # Connect token generation and callbacks
│   │   ├── accounts/         # Account management endpoints
│   │   ├── calendar-config/  # Calendar configuration
│   │   └── deploy-source/    # Pipedream source deployment
│   └── dashboard/            # User dashboard UI
├── lib/
│   ├── types.ts              # TypeScript type definitions
│   ├── pipedream.ts          # Pipedream client service
│   ├── supabase.ts           # Supabase client
│   └── calendar-sync.ts      # Core calendar sync logic
├── utils/
│   ├── retry.ts              # Retry logic with exponential backoff
│   └── error-handler.ts      # Centralized error handling
└── __tests__/                # Jest test files
```

## Setup

### Prerequisites

- Node.js 18+ and npm
- Pipedream account with Connect project
- Supabase project

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env.local
```

3. Configure environment variables in `.env.local`:
```env
PIPEDREAM_CLIENT_ID=your_client_id
PIPEDREAM_CLIENT_SECRET=your_client_secret
PIPEDREAM_PROJECT_ID=your_project_id
PIPEDREAM_ENVIRONMENT=development

SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key

WEBHOOK_SECRET=random_secret_string
```

4. Run database migrations (see Phase 1 in implementation plan)

5. Start development server:
```bash
npm run dev
```

The application will be available at http://localhost:3000

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

## API Endpoints

- `POST /api/webhook` - Receives webhooks from Pipedream sources
- `POST /api/connect/token` - Generate Connect token for user
- `GET /api/accounts` - List connected accounts for user
- `POST /api/calendar-config` - Save calendar configuration
- `POST /api/deploy-source` - Deploy Pipedream source for monitoring

## Documentation

See `mircal_resources/project_docs/MirCal - Implementation Plan v3 - Connect API Proxy Architecture.md` for detailed implementation guidance.

## License

Private - Client Project
