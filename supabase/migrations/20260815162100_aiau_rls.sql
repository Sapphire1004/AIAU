create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.aiau_is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
  );
$$;

create or replace function private.aiau_is_trip_owner(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
      and tm.role = 'owner'
  );
$$;

create or replace function private.aiau_is_plan_member(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plans p
    join public.trip_members tm on tm.trip_id = p.trip_id
    where p.id = p_plan_id
      and tm.user_id = auth.uid()
  );
$$;

create or replace function private.aiau_is_slot_member(p_slot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plan_slots ps
    join public.plans p on p.id = ps.plan_id
    join public.trip_members tm on tm.trip_id = p.trip_id
    where ps.id = p_slot_id
      and tm.user_id = auth.uid()
  );
$$;

revoke all on function private.aiau_is_trip_member(uuid) from public, anon;
revoke all on function private.aiau_is_trip_owner(uuid) from public, anon;
revoke all on function private.aiau_is_plan_member(uuid) from public, anon;
revoke all on function private.aiau_is_slot_member(uuid) from public, anon;
grant execute on function private.aiau_is_trip_member(uuid) to authenticated, service_role;
grant execute on function private.aiau_is_trip_owner(uuid) to authenticated, service_role;
grant execute on function private.aiau_is_plan_member(uuid) to authenticated, service_role;
grant execute on function private.aiau_is_slot_member(uuid) to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;
alter table public.messages enable row level security;
alter table public.notes enable row level security;
alter table public.ai_runs enable row level security;
alter table public.note_operations enable row level security;
alter table public.plans enable row level security;
alter table public.plan_slots enable row level security;
alter table public.plan_options enable row level security;
alter table public.votes enable row level security;
alter table public.plan_versions enable row level security;
alter table public.personal_events enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.share_links enable row level security;
alter table public.public_rate_limits enable row level security;
alter table public.offline_conflicts enable row level security;

revoke all on table public.profiles, public.trips, public.trip_members, public.trip_invites,
  public.messages, public.notes, public.ai_runs, public.note_operations, public.plans,
  public.plan_slots, public.plan_options, public.votes, public.plan_versions,
  public.personal_events, public.notifications, public.push_subscriptions,
  public.share_links, public.public_rate_limits, public.offline_conflicts
from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (timezone, default_reminder_minutes) on table public.profiles to authenticated;
grant select on table public.trips, public.trip_members, public.trip_invites to authenticated;
grant update (title, starts_at, ends_at, timezone, origin, budget, currency) on table public.trips to authenticated;
grant update (nickname) on table public.trip_members to authenticated;
grant select, insert on table public.messages to authenticated;
grant update (deleted_at) on table public.messages to authenticated;
grant select, insert on table public.notes to authenticated;
grant update (title, memo, attrs, user_touched, status, hold_reason, x, y, deleted_at) on table public.notes to authenticated;
grant select, insert on table public.ai_runs to authenticated;
grant select on table public.note_operations, public.plans, public.plan_slots, public.plan_options, public.plan_versions to authenticated;
grant select, insert, update, delete on table public.votes to authenticated;
grant select, insert on table public.personal_events to authenticated;
grant update (title, start_at, end_at, all_day, attrs, reminder_minutes, deleted_at) on table public.personal_events to authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
grant select, insert on table public.push_subscriptions to authenticated;
grant update (endpoint, p256dh, auth_key, expires_at, revoked_at) on table public.push_subscriptions to authenticated;
grant delete on table public.push_subscriptions to authenticated;
grant select on table public.share_links, public.offline_conflicts to authenticated;
grant update (status, resolution, resolved_at) on table public.offline_conflicts to authenticated;

grant all on table public.profiles, public.trips, public.trip_members, public.trip_invites,
  public.messages, public.notes, public.ai_runs, public.note_operations, public.plans,
  public.plan_slots, public.plan_options, public.votes, public.plan_versions,
  public.personal_events, public.notifications, public.push_subscriptions,
  public.share_links, public.public_rate_limits, public.offline_conflicts
to service_role;

create policy profiles_select_own on public.profiles
for select to authenticated
using (id = auth.uid());
create policy profiles_update_own on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy trips_select_member on public.trips
for select to authenticated
using (created_by = auth.uid() or private.aiau_is_trip_member(id));
create policy trips_update_owner on public.trips
for update to authenticated
using (private.aiau_is_trip_owner(id))
with check (private.aiau_is_trip_owner(id));

create policy trip_members_select_member on public.trip_members
for select to authenticated
using (private.aiau_is_trip_member(trip_id));
create policy trip_members_update_self on public.trip_members
for update to authenticated
using (user_id = auth.uid() and private.aiau_is_trip_member(trip_id))
with check (user_id = auth.uid() and private.aiau_is_trip_member(trip_id));

create policy trip_invites_select_owner on public.trip_invites
for select to authenticated
using (private.aiau_is_trip_owner(trip_id));

create policy messages_select_member on public.messages
for select to authenticated
using (private.aiau_is_trip_member(trip_id));
create policy messages_insert_member on public.messages
for insert to authenticated
with check (author_id = auth.uid() and private.aiau_is_trip_member(trip_id));
create policy messages_update_author on public.messages
for update to authenticated
using (author_id = auth.uid() and private.aiau_is_trip_member(trip_id))
with check (author_id = auth.uid() and private.aiau_is_trip_member(trip_id));

create policy notes_select_member on public.notes
for select to authenticated
using (private.aiau_is_trip_member(trip_id));
create policy notes_insert_member on public.notes
for insert to authenticated
with check (origin = 'user' and author_id = auth.uid() and private.aiau_is_trip_member(trip_id));
create policy notes_update_member on public.notes
for update to authenticated
using (private.aiau_is_trip_member(trip_id))
with check (private.aiau_is_trip_member(trip_id));

create policy ai_runs_select_member on public.ai_runs
for select to authenticated
using (private.aiau_is_trip_member(trip_id));
create policy ai_runs_insert_member on public.ai_runs
for insert to authenticated
with check (requested_by = auth.uid() and private.aiau_is_trip_member(trip_id));

create policy note_operations_select_member on public.note_operations
for select to authenticated
using (private.aiau_is_trip_member(trip_id));

create policy plans_select_member on public.plans
for select to authenticated
using (private.aiau_is_trip_member(trip_id));
create policy plan_slots_select_member on public.plan_slots
for select to authenticated
using (private.aiau_is_plan_member(plan_id));
create policy plan_options_select_member on public.plan_options
for select to authenticated
using (private.aiau_is_slot_member(slot_id));

create policy votes_select_member on public.votes
for select to authenticated
using (private.aiau_is_slot_member(slot_id));
create policy votes_insert_self on public.votes
for insert to authenticated
with check (user_id = auth.uid() and private.aiau_is_slot_member(slot_id));
create policy votes_update_self on public.votes
for update to authenticated
using (user_id = auth.uid() and private.aiau_is_slot_member(slot_id))
with check (user_id = auth.uid() and private.aiau_is_slot_member(slot_id));
create policy votes_delete_self on public.votes
for delete to authenticated
using (user_id = auth.uid() and private.aiau_is_slot_member(slot_id));

create policy plan_versions_select_member on public.plan_versions
for select to authenticated
using (private.aiau_is_plan_member(plan_id));

create policy personal_events_select_own on public.personal_events
for select to authenticated
using (user_id = auth.uid());
create policy personal_events_insert_own on public.personal_events
for insert to authenticated
with check (user_id = auth.uid());
create policy personal_events_update_own on public.personal_events
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy notifications_select_own on public.notifications
for select to authenticated
using (user_id = auth.uid());
create policy notifications_update_own on public.notifications
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy push_subscriptions_select_own on public.push_subscriptions
for select to authenticated
using (user_id = auth.uid());
create policy push_subscriptions_insert_own on public.push_subscriptions
for insert to authenticated
with check (user_id = auth.uid());
create policy push_subscriptions_update_own on public.push_subscriptions
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
create policy push_subscriptions_delete_own on public.push_subscriptions
for delete to authenticated
using (user_id = auth.uid());

create policy share_links_select_member on public.share_links
for select to authenticated
using (private.aiau_is_plan_member(plan_id));

create policy offline_conflicts_select_own on public.offline_conflicts
for select to authenticated
using (user_id = auth.uid());
create policy offline_conflicts_update_own on public.offline_conflicts
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
