create type public.aiau_member_role as enum ('owner', 'member');
create type public.aiau_note_origin as enum ('ai', 'user');
create type public.aiau_note_status as enum ('active', 'held');
create type public.aiau_ai_run_kind as enum ('extract_notes', 'generate_plan');
create type public.aiau_ai_run_status as enum ('pending', 'processing', 'completed', 'failed');
create type public.aiau_plan_slot_status as enum ('open', 'confirmed');
create type public.aiau_plan_option_kind as enum ('activity', 'travel', 'all_day', 'placeholder');
create type public.aiau_notification_type as enum ('plan_change', 'reminder', 'offline_conflict', 'invite', 'system');
create type public.aiau_offline_conflict_status as enum ('pending', 'resolved');
create type public.aiau_offline_resolution as enum ('local', 'server');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Tokyo' check (char_length(timezone) between 1 and 100),
  default_reminder_minutes integer not null default 30 check (default_reminder_minutes between 0 and 10080),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'Asia/Tokyo' check (char_length(timezone) between 1 and 100),
  origin text check (origin is null or char_length(origin) <= 300),
  budget numeric(12, 2) check (budget is null or budget >= 0),
  currency text not null default 'JPY' check (currency ~ '^[A-Z]{3}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create table public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 60),
  role public.aiau_member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  author_name text not null check (char_length(btrim(author_name)) between 1 and 60),
  text text not null check (char_length(btrim(text)) between 1 and 500),
  processed boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  memo text check (memo is null or char_length(memo) <= 2000),
  attrs jsonb not null default '{}'::jsonb check (jsonb_typeof(attrs) = 'object'),
  origin public.aiau_note_origin not null,
  user_touched boolean not null default false,
  status public.aiau_note_status not null default 'active',
  hold_reason text check (hold_reason is null or char_length(hold_reason) <= 500),
  source_message_id uuid references public.messages(id) on delete set null,
  author_id uuid references auth.users(id) on delete set null,
  x double precision not null default 0,
  y double precision not null default 0,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((status = 'held' and hold_reason is not null) or status = 'active')
);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  kind public.aiau_ai_run_kind not null,
  status public.aiau_ai_run_status not null default 'pending',
  requested_by uuid not null references auth.users(id) on delete restrict,
  input_hash text,
  idempotency_key text not null,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (trip_id, kind, idempotency_key)
);

create table public.note_operations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  note_id uuid references public.notes(id) on delete set null,
  run_id uuid references public.ai_runs(id) on delete set null,
  op text not null check (op in ('add', 'update', 'hold')),
  before_state jsonb,
  after_state jsonb not null,
  source_message_id uuid references public.messages(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  reverted_at timestamptz,
  reverted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (before_state is null or jsonb_typeof(before_state) = 'object'),
  check (jsonb_typeof(after_state) = 'object')
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null unique references public.trips(id) on delete cascade,
  current_version integer not null default 0 check (current_version >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plan_slots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status public.aiau_plan_slot_status not null default 'open',
  confirmed_option_id uuid,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_at > start_at)
);

create table public.plan_options (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.plan_slots(id) on delete cascade,
  note_id uuid references public.notes(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  start_at timestamptz not null,
  end_at timestamptz not null,
  kind public.aiau_plan_option_kind not null default 'activity',
  attrs jsonb not null default '{}'::jsonb check (jsonb_typeof(attrs) = 'object'),
  reason text check (reason is null or char_length(reason) <= 1000),
  user_touched boolean not null default false,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, slot_id),
  check (end_at > start_at)
);

alter table public.plan_slots
  add constraint plan_slots_confirmed_option_fkey
  foreign key (confirmed_option_id) references public.plan_options(id)
  deferrable initially deferred;

create table public.votes (
  slot_id uuid not null references public.plan_slots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (slot_id, user_id),
  foreign key (option_id, slot_id) references public.plan_options(id, slot_id) on delete cascade
);

create table public.plan_versions (
  plan_id uuid not null references public.plans(id) on delete cascade,
  version integer not null check (version > 0),
  actor_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('note_update', 'calendar_edit', 'manual_edit', 'ai_generate', 'ai_regenerate', 'confirm', 'unconfirm', 'restore')),
  summary text not null check (char_length(btrim(summary)) between 1 and 500),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  primary key (plan_id, version)
);

create table public.personal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  attrs jsonb not null default '{}'::jsonb check (jsonb_typeof(attrs) = 'object'),
  reminder_minutes integer check (reminder_minutes is null or reminder_minutes between 0 and 10080),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_at > start_at)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete cascade,
  type public.aiau_notification_type not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text check (body is null or char_length(body) <= 2000),
  link text check (link is null or char_length(link) <= 1000),
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.public_rate_limits (
  token_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  expires_at timestamptz not null,
  primary key (token_hash, window_start)
);

create table public.offline_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('personal_event', 'plan_option')),
  entity_id uuid not null,
  base_revision bigint not null check (base_revision > 0),
  server_revision bigint not null check (server_revision > 0),
  local_state jsonb not null check (jsonb_typeof(local_state) = 'object'),
  server_state jsonb not null check (jsonb_typeof(server_state) = 'object'),
  status public.aiau_offline_conflict_status not null default 'pending',
  resolution public.aiau_offline_resolution,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((status = 'pending' and resolution is null and resolved_at is null) or (status = 'resolved' and resolution is not null and resolved_at is not null))
);

create index trip_members_user_id_idx on public.trip_members(user_id);
create index trip_invites_trip_active_idx on public.trip_invites(trip_id, created_at desc) where revoked_at is null;
create index messages_trip_created_idx on public.messages(trip_id, created_at) where deleted_at is null;
create index messages_unprocessed_idx on public.messages(trip_id, created_at) where processed = false and deleted_at is null;
create index notes_trip_active_idx on public.notes(trip_id, updated_at desc) where deleted_at is null;
create index notes_source_message_idx on public.notes(source_message_id) where source_message_id is not null;
create index ai_runs_trip_created_idx on public.ai_runs(trip_id, created_at desc);
create index note_operations_note_created_idx on public.note_operations(note_id, created_at desc);
create index plan_slots_plan_time_idx on public.plan_slots(plan_id, start_at) where deleted_at is null;
create index plan_options_slot_active_idx on public.plan_options(slot_id, start_at) where deleted_at is null;
create index votes_option_idx on public.votes(option_id);
create index plan_versions_plan_created_idx on public.plan_versions(plan_id, created_at desc);
create index personal_events_user_time_idx on public.personal_events(user_id, start_at, end_at) where deleted_at is null;
create index notifications_user_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;
create index push_subscriptions_user_active_idx on public.push_subscriptions(user_id) where revoked_at is null;
create index share_links_plan_active_idx on public.share_links(plan_id, created_at desc) where revoked_at is null;
create index public_rate_limits_expiry_idx on public.public_rate_limits(expires_at);
create index offline_conflicts_user_pending_idx on public.offline_conflicts(user_id, created_at desc) where status = 'pending';

create or replace function public.aiau_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.aiau_touch_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.revision = old.revision + 1;
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.aiau_set_updated_at();
create trigger plans_set_updated_at before update on public.plans
for each row execute function public.aiau_set_updated_at();
create trigger votes_set_updated_at before update on public.votes
for each row execute function public.aiau_set_updated_at();
create trigger push_subscriptions_set_updated_at before update on public.push_subscriptions
for each row execute function public.aiau_set_updated_at();
create trigger trips_touch_revision before update on public.trips
for each row execute function public.aiau_touch_revision();
create trigger notes_touch_revision before update on public.notes
for each row execute function public.aiau_touch_revision();
create trigger plan_slots_touch_revision before update on public.plan_slots
for each row execute function public.aiau_touch_revision();
create trigger plan_options_touch_revision before update on public.plan_options
for each row execute function public.aiau_touch_revision();
create trigger personal_events_touch_revision before update on public.personal_events
for each row execute function public.aiau_touch_revision();

create or replace function public.aiau_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger aiau_on_auth_user_created
after insert on auth.users
for each row execute function public.aiau_handle_new_user();
