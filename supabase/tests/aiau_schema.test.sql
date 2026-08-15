begin;
select plan(30);
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'trips', 'trips exists');
select has_table('public', 'trip_members', 'trip_members exists');
select has_table('public', 'trip_invites', 'trip_invites exists');
select has_table('public', 'messages', 'messages exists');
select has_table('public', 'notes', 'notes exists');
select has_table('public', 'ai_runs', 'ai_runs exists');
select has_table('public', 'note_operations', 'note_operations exists');
select has_table('public', 'plans', 'plans exists');
select has_table('public', 'plan_slots', 'plan_slots exists');
select has_table('public', 'plan_options', 'plan_options exists');
select has_table('public', 'votes', 'votes exists');
select has_table('public', 'plan_versions', 'plan_versions exists');
select has_table('public', 'personal_events', 'personal_events exists');
select has_table('public', 'notifications', 'notifications exists');
select has_table('public', 'push_subscriptions', 'push_subscriptions exists');
select has_table('public', 'share_links', 'share_links exists');
select has_table('public', 'public_rate_limits', 'public_rate_limits exists');
select has_table('public', 'offline_conflicts', 'offline_conflicts exists');
select has_function('public', 'create_trip', 'create_trip exists');
select has_function('public', 'join_trip', 'join_trip exists');
select has_function('public', 'apply_note_operations', 'apply_note_operations exists');
select has_function('public', 'undo_note_operation', 'undo_note_operation exists');
select has_function('public', 'apply_plan_command', 'apply_plan_command exists');
select has_function('public', 'cast_vote', 'cast_vote exists');
select has_function('public', 'confirm_option', 'confirm_option exists');
select has_function('public', 'restore_plan_version', 'restore_plan_version exists');
select has_function('public', 'get_calendar_feed', 'get_calendar_feed exists');
select has_function('public', 'get_public_plan', 'get_public_plan exists');
select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'trip_members'
  ),
  'trip_members is published to supabase_realtime'
);
select * from finish();
rollback;
