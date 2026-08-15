revoke all on function public.aiau_handle_new_user() from public, anon, authenticated;
grant execute on function public.aiau_handle_new_user() to service_role;

create policy public_rate_limits_service_role on public.public_rate_limits
for all to service_role
using (true)
with check (true);

create index trips_created_by_idx on public.trips(created_by);
create index trip_invites_created_by_idx on public.trip_invites(created_by);
create index messages_author_id_idx on public.messages(author_id);
create index notes_author_id_idx on public.notes(author_id) where author_id is not null;
create index ai_runs_requested_by_idx on public.ai_runs(requested_by);
create index note_operations_trip_id_idx on public.note_operations(trip_id);
create index note_operations_run_id_idx on public.note_operations(run_id) where run_id is not null;
create index note_operations_source_message_id_idx on public.note_operations(source_message_id) where source_message_id is not null;
create index note_operations_actor_id_idx on public.note_operations(actor_id) where actor_id is not null;
create index note_operations_reverted_by_idx on public.note_operations(reverted_by) where reverted_by is not null;
create index plans_created_by_idx on public.plans(created_by);
create index plan_slots_confirmed_option_id_idx on public.plan_slots(confirmed_option_id) where confirmed_option_id is not null;
create index plan_options_note_id_idx on public.plan_options(note_id) where note_id is not null;
create index votes_user_id_idx on public.votes(user_id);
create index plan_versions_actor_id_idx on public.plan_versions(actor_id) where actor_id is not null;
create index notifications_user_id_idx on public.notifications(user_id);
create index notifications_trip_id_idx on public.notifications(trip_id) where trip_id is not null;
create index notifications_plan_id_idx on public.notifications(plan_id) where plan_id is not null;
create index push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
create index share_links_plan_id_idx on public.share_links(plan_id);
create index share_links_created_by_idx on public.share_links(created_by);
create index offline_conflicts_user_id_idx on public.offline_conflicts(user_id);
