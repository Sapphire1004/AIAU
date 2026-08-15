alter table public.messages replica identity full;
alter table public.notes replica identity full;
alter table public.plan_slots replica identity full;
alter table public.plan_options replica identity full;
alter table public.votes replica identity full;
alter table public.plan_versions replica identity full;
alter table public.personal_events replica identity full;
alter table public.notifications replica identity full;
alter table public.offline_conflicts replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.notes;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.plan_slots;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.plan_options;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.votes;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.plan_versions;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.personal_events;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.offline_conflicts;
exception when duplicate_object then null;
end;
$$;
