# PilgrimAI (Unified Full-Stack Application)

PilgrimAI is a unified Next.js application built with React 19, TypeScript, Tailwind CSS, and Supabase. It integrates AI-powered pilgrimage guidance, trip planning, itinerary management, conversation history, and user favourites.

## Architecture

```text
Next.js (React 19 + App Router)
├── Frontend UI (AppShell, ChatWindow, Trips, Itineraries, Favourites, Profile)
├── Next.js Route Handlers (/api/chat, /api/trips, /api/itineraries, /api/conversations, /api/favourites, /api/users/me)
├── Domain Services (AiService, ResearchService, TripService, ItineraryService, ConversationService, UserService)
└── Authentication & Database (Supabase Auth Google OAuth + Supabase PostgreSQL)
```

## Prerequisites

- Node.js 20 or later
- npm

## Setup & Configuration

1. Copy `.env.example` to `.env`:

```sh
copy .env.example .env
```

2. Configure environment variables in `.env`:

```env
# Supabase (Auth, Database & Storage)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-server-side-service-role-key
```

> **Security Note:** In Google Cloud Console and Supabase Dashboard, configure Google OAuth provider credentials. The Supabase OAuth redirect URL is `https://<your-project-ref>.supabase.co/auth/v1/callback`, and the application callback is `/auth/callback`. Never commit `.env` or production credentials.

## Development & Testing

Install dependencies:
```sh
npm install
```

Start the Next.js development server:
```sh
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

Run TypeScript validation:
```sh
npm run typecheck
```

Run automated Vitest test suite:
```sh
npm test
```

## Production Build

```sh
npm run build
npm run start
```

## API Endpoints

- `GET /api/health`: System health check
- `GET /api/auth/status`: Authentication readiness check
- `POST /api/chat`: AI assistant pilgrimage and trip planning endpoint
- `GET /api/trips`, `POST /api/trips`: List and create user trips
- `GET`, `PUT`, `DELETE /api/trips/[id]`: Trip detail, update, and deletion
- `GET`, `POST /api/trips/[id]/itineraries`: Trip-associated itinerary access and generation
- `GET`, `POST /api/itineraries`: Itinerary management
- `GET`, `DELETE /api/itineraries/[id]`: Single itinerary retrieval and deletion
- `POST /api/itineraries/[id]/items`: Add activities to an itinerary
- `GET`, `POST /api/conversations`: Conversation history management
- `GET`, `DELETE /api/conversations/[id]`: Single conversation retrieval and deletion
- `GET`, `POST /api/conversations/[id]/messages`: Message history and interaction
- `GET`, `POST /api/favourites`: User favourites list and creation
- `DELETE /api/favourites/[id]`: Remove saved favourite
- `GET`, `PUT /api/users/me`: Current user profile
- `GET /api/auth/google`: Supabase OAuth initiation
- `GET /auth/callback`: Supabase OAuth callback
