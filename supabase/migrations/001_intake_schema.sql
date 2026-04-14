-- Federal Benefits Intake — Supabase Schema
-- Run this in the Supabase SQL editor to set up the database

-- Enable UUID generation
create extension if not exists "uuid-ossp" schema extensions;

-- Intake sessions: created when advisor sends a link to the client
create table intake_sessions (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique,
  client_name text not null,
  client_email text not null,
  sf_lead_id text,
  sf_contact_id text,
  sf_intake_id text,
  advisor_id text,
  status text not null default 'active'
    check (status in ('active', 'uploaded', 'parsed', 'complete', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index idx_sessions_token on intake_sessions(token);
create index idx_sessions_sf_intake on intake_sessions(sf_intake_id);

-- Documents: each uploaded file
create table documents (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references intake_sessions(id) on delete cascade,
  file_name text not null,
  file_type text not null,
  file_size bigint not null,
  document_type text not null
    check (document_type in ('LES', 'TSP_Statement', 'SF50', 'DD214', 'PSB', 'SS_Statement', 'Other')),
  storage_path text not null,
  parsed boolean not null default false,
  parsed_at timestamptz,
  confidence integer,
  parsed_fields jsonb,
  uploaded_at timestamptz not null default now()
);

create index idx_docs_session on documents(session_id);

-- Audit log: every action is recorded
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references intake_sessions(id) on delete set null,
  document_id uuid references documents(id) on delete set null,
  action text not null,
  actor text not null default 'system',
  ip_address text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_session on audit_log(session_id);

-- Storage bucket: encrypted document storage
-- Run this via Supabase dashboard or API:
-- insert into storage.buckets (id, name, public) values ('federal-docs', 'federal-docs', false);

-- RLS policies: lock everything down
alter table intake_sessions enable row level security;
alter table documents enable row level security;
alter table audit_log enable row level security;

-- Only service role (server-side) can access these tables
-- No client-side access at all — the Next.js API routes use the service role key
create policy "Service role only" on intake_sessions
  for all using (auth.role() = 'service_role');

create policy "Service role only" on documents
  for all using (auth.role() = 'service_role');

create policy "Service role only" on audit_log
  for all using (auth.role() = 'service_role');
