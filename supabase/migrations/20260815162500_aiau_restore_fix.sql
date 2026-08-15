create or replace function public.restore_plan_version(
  p_plan_id uuid,
  p_version integer,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.plans%rowtype;
  v_snapshot jsonb;
  v_slot jsonb;
  v_option jsonb;
  v_new_version integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not private.aiau_is_plan_member(p_plan_id) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select * into v_plan from public.plans where id = p_plan_id for update;
  if v_plan.id is null then
    raise exception 'PLAN_NOT_FOUND';
  end if;
  if v_plan.current_version <> p_expected_version then
    raise exception 'VERSION_CONFLICT';
  end if;

  select snapshot into v_snapshot
  from public.plan_versions
  where plan_id = p_plan_id and version = p_version;

  if v_snapshot is null then
    raise exception 'VERSION_NOT_FOUND';
  end if;

  update public.plan_slots
  set confirmed_option_id = null, status = 'open'
  where plan_id = p_plan_id and deleted_at is null;

  update public.plan_options po
  set deleted_at = now()
  from public.plan_slots ps
  where po.slot_id = ps.id and ps.plan_id = p_plan_id and po.deleted_at is null;

  update public.plan_slots
  set deleted_at = now()
  where plan_id = p_plan_id and deleted_at is null;

  for v_slot in select value from jsonb_array_elements(v_snapshot -> 'slots')
  loop
    insert into public.plan_slots (
      id, plan_id, start_at, end_at, status, confirmed_option_id, revision, created_at, updated_at, deleted_at
    ) values (
      (v_slot ->> 'id')::uuid,
      p_plan_id,
      (v_slot ->> 'start_at')::timestamptz,
      (v_slot ->> 'end_at')::timestamptz,
      (v_slot ->> 'status')::public.aiau_plan_slot_status,
      nullif(v_slot ->> 'confirmed_option_id', '')::uuid,
      greatest(coalesce((v_slot ->> 'revision')::bigint, 1), 1),
      coalesce((v_slot ->> 'created_at')::timestamptz, now()),
      now(),
      nullif(v_slot ->> 'deleted_at', '')::timestamptz
    ) on conflict (id) do update
    set plan_id = excluded.plan_id,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        status = excluded.status,
        confirmed_option_id = excluded.confirmed_option_id,
        deleted_at = excluded.deleted_at;
  end loop;

  for v_option in select value from jsonb_array_elements(v_snapshot -> 'options')
  loop
    insert into public.plan_options (
      id, slot_id, note_id, title, start_at, end_at, kind, attrs, reason,
      user_touched, revision, created_at, updated_at, deleted_at
    ) values (
      (v_option ->> 'id')::uuid,
      (v_option ->> 'slot_id')::uuid,
      nullif(v_option ->> 'note_id', '')::uuid,
      v_option ->> 'title',
      (v_option ->> 'start_at')::timestamptz,
      (v_option ->> 'end_at')::timestamptz,
      (v_option ->> 'kind')::public.aiau_plan_option_kind,
      coalesce(v_option -> 'attrs', '{}'::jsonb),
      v_option ->> 'reason',
      coalesce((v_option ->> 'user_touched')::boolean, false),
      greatest(coalesce((v_option ->> 'revision')::bigint, 1), 1),
      coalesce((v_option ->> 'created_at')::timestamptz, now()),
      now(),
      nullif(v_option ->> 'deleted_at', '')::timestamptz
    ) on conflict (id) do update
    set slot_id = excluded.slot_id,
        note_id = excluded.note_id,
        title = excluded.title,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        kind = excluded.kind,
        attrs = excluded.attrs,
        reason = excluded.reason,
        user_touched = excluded.user_touched,
        deleted_at = excluded.deleted_at;
  end loop;

  v_new_version := private.aiau_record_plan_version(p_plan_id, v_user_id, 'restore', 'バージョン ' || p_version || ' を復元');
  return jsonb_build_object('version', v_new_version, 'restored_from', p_version, 'snapshot', private.aiau_plan_snapshot(p_plan_id));
end;
$$;

revoke all on function public.restore_plan_version(uuid, integer, integer) from public, anon;
grant execute on function public.restore_plan_version(uuid, integer, integer) to authenticated;
