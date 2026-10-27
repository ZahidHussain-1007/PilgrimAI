-- PilgrimAI — Supabase (PostgreSQL) schema
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query → Run.
-- Columns match src/services/* exactly (conversations, messages, trips,
-- itineraries, itinerary_items, favourites). Safe to re-run (idempotent).

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default 'New conversation',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- messages (ownership via parent conversation)
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------
create table if not exists public.trips (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null,
  origin       text,
  destinations jsonb,
  start_date   text,              -- free-form "YYYY-MM-DD" (validated ≤50 chars in app)
  end_date     text,
  travelers    double precision,  -- app validates 1..100
  budget       double precision,  -- app validates >= 0
  preferences  jsonb not null default '[]'::jsonb,
  constraints  jsonb,
  status       text not null default 'planning',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- itineraries (user_id defaults to the signed-in user via JWT)
-- ---------------------------------------------------------------------------
create table if not exists public.itineraries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id    uuid references public.trips (id) on delete cascade,
  status     text not null default 'planning',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- itinerary_items (ownership via parent itinerary)
-- ---------------------------------------------------------------------------
create table if not exists public.itinerary_items (
  id             uuid primary key default gen_random_uuid(),
  itinerary_id   uuid not null references public.itineraries (id) on delete cascade,
  day_number     integer not null default 1,
  title          text not null,
  location       text,
  start_time     text,
  end_time       text,
  description    text,
  estimated_cost double precision,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- favourites
-- ---------------------------------------------------------------------------
create table if not exists public.favourites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  item_type  text not null default 'temple',
  item_id    text not null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- indexes (match every WHERE / ORDER BY in src/services)
-- ---------------------------------------------------------------------------
create index if not exists conversations_user_updated_idx on public.conversations (user_id, updated_at desc);
create index if not exists messages_conversation_idx      on public.messages (conversation_id, created_at);
create index if not exists trips_user_idx                 on public.trips (user_id, created_at desc);
create index if not exists itineraries_trip_idx           on public.itineraries (trip_id);
create index if not exists itineraries_user_idx           on public.itineraries (user_id);
create index if not exists itinerary_items_itinerary_idx  on public.itinerary_items (itinerary_id, day_number, start_time);
create index if not exists favourites_user_idx            on public.favourites (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: every user sees only their own rows
-- ---------------------------------------------------------------------------
alter table public.conversations   enable row level security;
alter table public.messages        enable row level security;
alter table public.trips           enable row level security;
alter table public.itineraries     enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.favourites      enable row level security;

drop policy if exists "own conversations"        on public.conversations;
create policy "own conversations" on public.conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own conversation messages" on public.messages;
create policy "own conversation messages" on public.messages
  for all using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "own trips"       on public.trips;
create policy "own trips" on public.trips
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own itineraries" on public.itineraries;
create policy "own itineraries" on public.itineraries
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own itinerary items" on public.itinerary_items;
create policy "own itinerary items" on public.itinerary_items
  for all using (
    exists (
      select 1 from public.itineraries i
      where i.id = itinerary_items.itinerary_id and i.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.itineraries i
      where i.id = itinerary_items.itinerary_id and i.user_id = auth.uid()
    )
  );

drop policy if exists "own favourites"  on public.favourites;
create policy "own favourites" on public.favourites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- table privileges for API roles (RLS above still restricts rows)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.conversations   to authenticated, anon;
grant select, insert, update, delete on public.messages        to authenticated, anon;
grant select, insert, update, delete on public.trips           to authenticated, anon;
grant select, insert, update, delete on public.itineraries     to authenticated, anon;
grant select, insert, update, delete on public.itinerary_items to authenticated, anon;
grant select, insert, update, delete on public.favourites      to authenticated, anon;
