alter table public.trip_members replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.trip_members;
exception when duplicate_object then null;
end;
$$;
