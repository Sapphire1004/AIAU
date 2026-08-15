create or replace function private.aiau_plan_snapshot(p_plan_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slots', coalesce((
      select jsonb_agg(to_jsonb(ps) order by ps.start_at, ps.id)
      from public.plan_slots ps
      where ps.plan_id = p_plan_id and ps.deleted_at is null
    ), '[]'::jsonb),
    'options', coalesce((
      select jsonb_agg(to_jsonb(po) order by po.start_at, po.id)
      from public.plan_options po
      join public.plan_slots ps on ps.id = po.slot_id
      where ps.plan_id = p_plan_id
        and ps.deleted_at is null
        and po.deleted_at is null
    ), '[]'::jsonb)
  );
$$;

create or replace function private.aiau_record_plan_version(
  p_plan_id uuid,
  p_actor_id uuid,
  p_source text,
  p_summary text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  update public.plans
  set current_version = current_version + 1
  where id = p_plan_id
  returning current_version into v_version;

  if v_version is null then
    raise exception 'PLAN_NOT_FOUND';
  end if;

  insert into public.plan_versions (plan_id, version, actor_id, source, summary, snapshot)
  values (p_plan_id, v_version, p_actor_id, p_source, p_summary, private.aiau_plan_snapshot(p_plan_id));

  return v_version;
end;
$$;

create or replace function public.create_trip(
  p_title text,
  p_nickname text,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_timezone text default 'Asia/Tokyo',
  p_origin text default null,
  p_budget numeric default null,
  p_currency text default 'JPY'
)
returns table (trip_id uuid, plan_id uuid, invite_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_trip_id uuid;
  v_plan_id uuid;
  v_token text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'INVALID_TIME_RANGE';
  end if;

  insert into public.trips (title, starts_at, ends_at, timezone, origin, budget, currency, created_by)
  values (btrim(p_title), p_starts_at, p_ends_at, p_timezone, nullif(btrim(p_origin), ''), p_budget, upper(p_currency), v_user_id)
  returning id into v_trip_id;

  insert into public.trip_members (trip_id, user_id, nickname, role)
  values (v_trip_id, v_user_id, btrim(p_nickname), 'owner');

  insert into public.plans (trip_id, created_by)
  values (v_trip_id, v_user_id)
  returning id into v_plan_id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.trip_invites (trip_id, token_hash, created_by)
  values (v_trip_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_user_id);

  return query select v_trip_id, v_plan_id, v_token;
end;
$$;

create or replace function public.join_trip(p_invite_token text, p_nickname text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_trip_id uuid;
  v_hash text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  v_hash := encode(extensions.digest(p_invite_token, 'sha256'), 'hex');

  select ti.trip_id into v_trip_id
  from public.trip_invites ti
  where ti.token_hash = v_hash
    and ti.revoked_at is null
    and (ti.expires_at is null or ti.expires_at > now());

  if v_trip_id is null then
    raise exception 'INVALID_INVITE';
  end if;

  insert into public.trip_members (trip_id, user_id, nickname, role)
  values (v_trip_id, v_user_id, btrim(p_nickname), 'member')
  on conflict (trip_id, user_id) do update
  set nickname = excluded.nickname;

  return v_trip_id;
end;
$$;

create or replace function public.create_trip_invite(p_trip_id uuid, p_expires_at timestamptz default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not private.aiau_is_trip_owner(p_trip_id) then
    raise exception 'FORBIDDEN';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.trip_invites (trip_id, token_hash, created_by, expires_at)
  values (p_trip_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_user_id, p_expires_at);

  return v_token;
end;
$$;

create or replace function public.revoke_trip_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
begin
  select trip_id into v_trip_id from public.trip_invites where id = p_invite_id;
  if v_trip_id is null then
    raise exception 'NOT_FOUND';
  end if;
  if not private.aiau_is_trip_owner(v_trip_id) then
    raise exception 'FORBIDDEN';
  end if;

  update public.trip_invites set revoked_at = now() where id = p_invite_id;
end;
$$;

create or replace function public.apply_note_operations(
  p_trip_id uuid,
  p_run_id uuid,
  p_operations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.ai_runs%rowtype;
  v_operation jsonb;
  v_source_id uuid;
  v_target_id uuid;
  v_note public.notes%rowtype;
  v_before jsonb;
  v_applied integer := 0;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not private.aiau_is_trip_member(p_trip_id) then
    raise exception 'NOT_A_MEMBER';
  end if;
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception 'INVALID_OPERATIONS';
  end if;

  select * into v_run
  from public.ai_runs
  where id = p_run_id and trip_id = p_trip_id
  for update;

  if v_run.id is null or v_run.requested_by <> v_user_id or v_run.kind <> 'extract_notes' then
    raise exception 'INVALID_RUN';
  end if;
  if v_run.status = 'completed' then
    return jsonb_build_object('status', 'completed', 'applied', 0, 'idempotent', true);
  end if;

  update public.ai_runs
  set status = 'processing', started_at = coalesce(started_at, now()), error_code = null, error_message = null
  where id = p_run_id;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    if not (v_operation ? 'op') or not (v_operation ? 'source') then
      raise exception 'INVALID_OPERATION';
    end if;

    v_source_id := (v_operation ->> 'source')::uuid;
    if not exists (
      select 1 from public.messages
      where id = v_source_id and trip_id = p_trip_id and deleted_at is null
    ) then
      raise exception 'INVALID_SOURCE';
    end if;

    if v_operation ->> 'op' = 'add' then
      insert into public.notes (
        trip_id, title, memo, attrs, origin, source_message_id, author_id
      ) values (
        p_trip_id,
        btrim(v_operation ->> 'title'),
        v_operation ->> 'memo',
        coalesce(v_operation -> 'attrs', '{}'::jsonb),
        'ai',
        v_source_id,
        null
      ) returning * into v_note;

      insert into public.note_operations (
        trip_id, note_id, run_id, op, before_state, after_state, source_message_id, actor_id
      ) values (
        p_trip_id, v_note.id, p_run_id, 'add', null, to_jsonb(v_note), v_source_id, v_user_id
      );
      v_applied := v_applied + 1;

    elsif v_operation ->> 'op' in ('update', 'hold') then
      if not (v_operation ? 'target') then
        raise exception 'INVALID_TARGET';
      end if;
      v_target_id := (v_operation ->> 'target')::uuid;

      select * into v_note
      from public.notes
      where id = v_target_id
        and trip_id = p_trip_id
        and deleted_at is null
      for update;

      if v_note.id is null then
        continue;
      end if;
      if v_note.user_touched then
        continue;
      end if;

      v_before := to_jsonb(v_note);

      if v_operation ->> 'op' = 'update' then
        update public.notes
        set title = case when v_operation ? 'title' then btrim(v_operation ->> 'title') else title end,
            memo = case when v_operation ? 'memo' then v_operation ->> 'memo' else memo end,
            attrs = attrs || coalesce(v_operation -> 'attrs', '{}'::jsonb),
            source_message_id = v_source_id
        where id = v_target_id
        returning * into v_note;
      else
        if nullif(btrim(v_operation ->> 'reason'), '') is null then
          raise exception 'HOLD_REASON_REQUIRED';
        end if;
        update public.notes
        set status = 'held',
            hold_reason = btrim(v_operation ->> 'reason'),
            source_message_id = v_source_id
        where id = v_target_id
        returning * into v_note;
      end if;

      insert into public.note_operations (
        trip_id, note_id, run_id, op, before_state, after_state, source_message_id, actor_id
      ) values (
        p_trip_id, v_note.id, p_run_id, v_operation ->> 'op', v_before, to_jsonb(v_note), v_source_id, v_user_id
      );
      v_applied := v_applied + 1;
    else
      raise exception 'UNSUPPORTED_OPERATION';
    end if;

    update public.messages
    set processed = true, processed_at = now()
    where id = v_source_id;
  end loop;

  update public.ai_runs
  set status = 'completed', finished_at = now()
  where id = p_run_id;

  return jsonb_build_object('status', 'completed', 'applied', v_applied, 'idempotent', false);
end;
$$;

create or replace function public.undo_note_operation(p_operation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_operation public.note_operations%rowtype;
  v_status public.aiau_note_status;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_operation
  from public.note_operations
  where id = p_operation_id
  for update;

  if v_operation.id is null then
    raise exception 'NOT_FOUND';
  end if;
  if not private.aiau_is_trip_member(v_operation.trip_id) then
    raise exception 'NOT_A_MEMBER';
  end if;
  if v_operation.reverted_at is not null then
    return v_operation.note_id;
  end if;

  if v_operation.op = 'add' then
    update public.notes
    set deleted_at = now(), user_touched = true
    where id = v_operation.note_id;
  else
    v_status := (v_operation.before_state ->> 'status')::public.aiau_note_status;
    update public.notes
    set title = v_operation.before_state ->> 'title',
        memo = v_operation.before_state ->> 'memo',
        attrs = coalesce(v_operation.before_state -> 'attrs', '{}'::jsonb),
        status = v_status,
        hold_reason = v_operation.before_state ->> 'hold_reason',
        source_message_id = nullif(v_operation.before_state ->> 'source_message_id', '')::uuid,
        x = (v_operation.before_state ->> 'x')::double precision,
        y = (v_operation.before_state ->> 'y')::double precision,
        user_touched = true,
        deleted_at = nullif(v_operation.before_state ->> 'deleted_at', '')::timestamptz
    where id = v_operation.note_id;
  end if;

  update public.note_operations
  set reverted_at = now(), reverted_by = v_user_id
  where id = p_operation_id;

  return v_operation.note_id;
end;
$$;

create or replace function public.apply_plan_command(
  p_plan_id uuid,
  p_expected_version integer,
  p_command jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.plans%rowtype;
  v_type text;
  v_payload jsonb;
  v_slot_id uuid;
  v_option_id uuid;
  v_note_id uuid;
  v_slot jsonb;
  v_option jsonb;
  v_source text := 'manual_edit';
  v_summary text;
  v_version integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not private.aiau_is_plan_member(p_plan_id) then
    raise exception 'NOT_A_MEMBER';
  end if;
  if jsonb_typeof(p_command) <> 'object' or not (p_command ? 'type') then
    raise exception 'INVALID_COMMAND';
  end if;

  select * into v_plan from public.plans where id = p_plan_id for update;
  if v_plan.id is null then
    raise exception 'PLAN_NOT_FOUND';
  end if;
  if v_plan.current_version <> p_expected_version then
    raise exception 'VERSION_CONFLICT';
  end if;

  v_type := p_command ->> 'type';
  v_payload := coalesce(p_command -> 'payload', '{}'::jsonb);
  v_summary := coalesce(nullif(btrim(p_command ->> 'summary'), ''), replace(v_type, '_', ' '));

  if v_type = 'add_slot' then
    v_slot_id := coalesce(nullif(v_payload ->> 'id', '')::uuid, gen_random_uuid());
    insert into public.plan_slots (id, plan_id, start_at, end_at, status)
    values (
      v_slot_id,
      p_plan_id,
      (v_payload ->> 'start_at')::timestamptz,
      (v_payload ->> 'end_at')::timestamptz,
      'open'
    );

    for v_option in select value from jsonb_array_elements(coalesce(v_payload -> 'options', '[]'::jsonb))
    loop
      insert into public.plan_options (
        id, slot_id, note_id, title, start_at, end_at, kind, attrs, reason, user_touched
      ) values (
        coalesce(nullif(v_option ->> 'id', '')::uuid, gen_random_uuid()),
        v_slot_id,
        nullif(v_option ->> 'note_id', '')::uuid,
        btrim(v_option ->> 'title'),
        coalesce(nullif(v_option ->> 'start_at', '')::timestamptz, (v_payload ->> 'start_at')::timestamptz),
        coalesce(nullif(v_option ->> 'end_at', '')::timestamptz, (v_payload ->> 'end_at')::timestamptz),
        coalesce(nullif(v_option ->> 'kind', '')::public.aiau_plan_option_kind, 'activity'),
        coalesce(v_option -> 'attrs', '{}'::jsonb),
        v_option ->> 'reason',
        coalesce((v_option ->> 'user_touched')::boolean, false)
      );
    end loop;

  elsif v_type = 'add_option' then
    v_slot_id := (v_payload ->> 'slot_id')::uuid;
    if not exists (select 1 from public.plan_slots where id = v_slot_id and plan_id = p_plan_id and deleted_at is null) then
      raise exception 'INVALID_SLOT';
    end if;
    insert into public.plan_options (
      slot_id, note_id, title, start_at, end_at, kind, attrs, reason, user_touched
    ) values (
      v_slot_id,
      nullif(v_payload ->> 'note_id', '')::uuid,
      btrim(v_payload ->> 'title'),
      (v_payload ->> 'start_at')::timestamptz,
      (v_payload ->> 'end_at')::timestamptz,
      coalesce(nullif(v_payload ->> 'kind', '')::public.aiau_plan_option_kind, 'activity'),
      coalesce(v_payload -> 'attrs', '{}'::jsonb),
      v_payload ->> 'reason',
      true
    );

  elsif v_type in ('update_option', 'move_option', 'resize_option', 'calendar_edit') then
    v_option_id := (v_payload ->> 'option_id')::uuid;
    update public.plan_options po
    set title = case when v_payload ? 'title' then btrim(v_payload ->> 'title') else po.title end,
        start_at = case when v_payload ? 'start_at' then (v_payload ->> 'start_at')::timestamptz else po.start_at end,
        end_at = case when v_payload ? 'end_at' then (v_payload ->> 'end_at')::timestamptz else po.end_at end,
        attrs = case when v_payload ? 'attrs' then po.attrs || coalesce(v_payload -> 'attrs', '{}'::jsonb) else po.attrs end,
        reason = case when v_payload ? 'reason' then v_payload ->> 'reason' else po.reason end,
        user_touched = true
    from public.plan_slots ps
    where po.id = v_option_id
      and po.slot_id = ps.id
      and ps.plan_id = p_plan_id
      and po.deleted_at is null;
    if not found then
      raise exception 'INVALID_OPTION';
    end if;
    if v_type = 'calendar_edit' then
      v_source := 'calendar_edit';
    end if;

  elsif v_type = 'delete_option' then
    v_option_id := (v_payload ->> 'option_id')::uuid;
    update public.plan_options po
    set deleted_at = now(), user_touched = true
    from public.plan_slots ps
    where po.id = v_option_id
      and po.slot_id = ps.id
      and ps.plan_id = p_plan_id
      and po.deleted_at is null;
    if not found then
      raise exception 'INVALID_OPTION';
    end if;
    update public.plan_slots
    set status = 'open', confirmed_option_id = null
    where plan_id = p_plan_id and confirmed_option_id = v_option_id;

  elsif v_type = 'refresh_from_note' then
    v_note_id := (v_payload ->> 'note_id')::uuid;
    if not exists (
      select 1 from public.notes n
      join public.plans p on p.trip_id = n.trip_id
      where n.id = v_note_id and p.id = p_plan_id and n.deleted_at is null
    ) then
      raise exception 'INVALID_NOTE';
    end if;

    update public.plan_options po
    set title = n.title,
        attrs = po.attrs || n.attrs || jsonb_build_object('memo', n.memo),
        reason = '付箋の更新を反映'
    from public.notes n, public.plan_slots ps
    where n.id = v_note_id
      and po.note_id = n.id
      and po.slot_id = ps.id
      and ps.plan_id = p_plan_id
      and po.deleted_at is null;

    update public.plan_slots ps
    set status = 'open', confirmed_option_id = null
    where ps.plan_id = p_plan_id
      and ps.confirmed_option_id in (
        select po.id from public.plan_options po where po.note_id = v_note_id
      );
    v_source := 'note_update';

  elsif v_type = 'unconfirm' then
    v_slot_id := (v_payload ->> 'slot_id')::uuid;
    update public.plan_slots
    set status = 'open', confirmed_option_id = null
    where id = v_slot_id and plan_id = p_plan_id and deleted_at is null;
    if not found then
      raise exception 'INVALID_SLOT';
    end if;
    v_source := 'unconfirm';

  elsif v_type = 'replace_plan' then
    update public.plan_options po
    set deleted_at = now()
    from public.plan_slots ps
    where po.slot_id = ps.id
      and ps.plan_id = p_plan_id
      and po.deleted_at is null
      and po.user_touched = false;

    update public.plan_slots ps
    set deleted_at = now(), status = 'open', confirmed_option_id = null
    where ps.plan_id = p_plan_id
      and ps.deleted_at is null
      and not exists (
        select 1 from public.plan_options po
        where po.slot_id = ps.id and po.deleted_at is null and po.user_touched = true
      );

    for v_slot in select value from jsonb_array_elements(coalesce(v_payload -> 'slots', '[]'::jsonb))
    loop
      v_slot_id := coalesce(nullif(v_slot ->> 'id', '')::uuid, gen_random_uuid());
      insert into public.plan_slots (id, plan_id, start_at, end_at, status)
      values (
        v_slot_id,
        p_plan_id,
        (v_slot ->> 'start_at')::timestamptz,
        (v_slot ->> 'end_at')::timestamptz,
        'open'
      );

      for v_option in select value from jsonb_array_elements(coalesce(v_slot -> 'options', '[]'::jsonb))
      loop
        insert into public.plan_options (
          id, slot_id, note_id, title, start_at, end_at, kind, attrs, reason, user_touched
        ) values (
          coalesce(nullif(v_option ->> 'id', '')::uuid, gen_random_uuid()),
          v_slot_id,
          nullif(v_option ->> 'note_id', '')::uuid,
          btrim(v_option ->> 'title'),
          (v_option ->> 'start_at')::timestamptz,
          (v_option ->> 'end_at')::timestamptz,
          coalesce(nullif(v_option ->> 'kind', '')::public.aiau_plan_option_kind, 'activity'),
          coalesce(v_option -> 'attrs', '{}'::jsonb),
          v_option ->> 'reason',
          false
        );
      end loop;
    end loop;
    v_source := case when coalesce((v_payload ->> 'regenerate')::boolean, false) then 'ai_regenerate' else 'ai_generate' end;

  else
    raise exception 'UNSUPPORTED_COMMAND';
  end if;

  v_version := private.aiau_record_plan_version(p_plan_id, v_user_id, v_source, v_summary);
  return jsonb_build_object('version', v_version, 'snapshot', private.aiau_plan_snapshot(p_plan_id));
end;
$$;

create or replace function public.cast_vote(p_slot_id uuid, p_option_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not private.aiau_is_slot_member(p_slot_id) then
    raise exception 'NOT_A_MEMBER';
  end if;
  if not exists (
    select 1 from public.plan_options
    where id = p_option_id and slot_id = p_slot_id and deleted_at is null
  ) then
    raise exception 'INVALID_OPTION';
  end if;

  insert into public.votes (slot_id, user_id, option_id)
  values (p_slot_id, v_user_id, p_option_id)
  on conflict (slot_id, user_id) do update
  set option_id = excluded.option_id;

  return (
    select coalesce(jsonb_object_agg(option_id, vote_count), '{}'::jsonb)
    from (
      select po.id as option_id, count(v.user_id)::integer as vote_count
      from public.plan_options po
      left join public.votes v on v.option_id = po.id and v.slot_id = po.slot_id
      where po.slot_id = p_slot_id and po.deleted_at is null
      group by po.id
    ) counts
  );
end;
$$;

create or replace function public.confirm_option(
  p_slot_id uuid,
  p_option_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan_id uuid;
  v_trip_id uuid;
  v_current_version integer;
  v_selected_votes integer;
  v_max_votes integer;
  v_version integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select p.id, p.trip_id, p.current_version
  into v_plan_id, v_trip_id, v_current_version
  from public.plan_slots ps
  join public.plans p on p.id = ps.plan_id
  where ps.id = p_slot_id and ps.deleted_at is null
  for update of p;

  if v_plan_id is null then
    raise exception 'INVALID_SLOT';
  end if;
  if not private.aiau_is_trip_member(v_trip_id) then
    raise exception 'NOT_A_MEMBER';
  end if;
  if v_current_version <> p_expected_version then
    raise exception 'VERSION_CONFLICT';
  end if;
  if not exists (
    select 1 from public.plan_options
    where id = p_option_id and slot_id = p_slot_id and deleted_at is null
  ) then
    raise exception 'INVALID_OPTION';
  end if;

  select count(*)::integer into v_selected_votes
  from public.votes
  where slot_id = p_slot_id and option_id = p_option_id;

  select max(vote_count) into v_max_votes
  from (
    select po.id, count(v.user_id)::integer as vote_count
    from public.plan_options po
    left join public.votes v on v.option_id = po.id and v.slot_id = po.slot_id
    where po.slot_id = p_slot_id and po.deleted_at is null
    group by po.id
  ) counts;

  if v_selected_votes <> coalesce(v_max_votes, 0) then
    raise exception 'NOT_TOP_VOTED';
  end if;

  update public.plan_slots
  set status = 'confirmed', confirmed_option_id = p_option_id
  where id = p_slot_id;

  v_version := private.aiau_record_plan_version(v_plan_id, v_user_id, 'confirm', '採用案を確定');

  insert into public.notifications (user_id, trip_id, plan_id, type, title, body, link, dedupe_key)
  select tm.user_id,
         v_trip_id,
         v_plan_id,
         'plan_change',
         'プランが確定されました',
         po.title,
         '/trips/' || v_trip_id || '/plan',
         'confirm:' || p_slot_id || ':' || v_version
  from public.trip_members tm
  join public.plan_options po on po.id = p_option_id
  where tm.trip_id = v_trip_id
  on conflict (user_id, dedupe_key) do nothing;

  return jsonb_build_object('version', v_version, 'confirmed_option_id', p_option_id);
end;
$$;

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

create or replace function public.get_calendar_feed(
  p_from timestamptz,
  p_to timestamptz,
  p_timezone text default 'Asia/Tokyo'
)
returns table (
  id uuid,
  source text,
  plan_id uuid,
  note_id uuid,
  title text,
  start_at timestamptz,
  end_at timestamptz,
  all_day boolean,
  kind text,
  attrs jsonb,
  revision bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select po.id,
         'plan'::text,
         p.id,
         po.note_id,
         po.title,
         po.start_at,
         po.end_at,
         po.kind = 'all_day',
         po.kind::text,
         po.attrs,
         po.revision
  from public.plan_options po
  join public.plan_slots ps on ps.id = po.slot_id
  join public.plans p on p.id = ps.plan_id
  where ps.status = 'confirmed'
    and ps.confirmed_option_id = po.id
    and ps.deleted_at is null
    and po.deleted_at is null
    and po.start_at < p_to
    and po.end_at > p_from

  union all

  select pe.id,
         'personal'::text,
         null::uuid,
         null::uuid,
         pe.title,
         pe.start_at,
         pe.end_at,
         pe.all_day,
         'personal'::text,
         pe.attrs,
         pe.revision
  from public.personal_events pe
  where pe.user_id = auth.uid()
    and pe.deleted_at is null
    and pe.start_at < p_to
    and pe.end_at > p_from
  order by start_at;
$$;

create or replace function public.upsert_personal_event(
  p_event jsonb,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.personal_events%rowtype;
  v_event_id uuid;
  v_conflict_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  v_event_id := nullif(p_event ->> 'id', '')::uuid;
  if v_event_id is null then
    insert into public.personal_events (
      user_id, title, start_at, end_at, all_day, attrs, reminder_minutes
    ) values (
      v_user_id,
      btrim(p_event ->> 'title'),
      (p_event ->> 'start_at')::timestamptz,
      (p_event ->> 'end_at')::timestamptz,
      coalesce((p_event ->> 'all_day')::boolean, false),
      coalesce(p_event -> 'attrs', '{}'::jsonb),
      nullif(p_event ->> 'reminder_minutes', '')::integer
    ) returning * into v_event;
    return jsonb_build_object('status', 'applied', 'event', to_jsonb(v_event));
  end if;

  select * into v_event
  from public.personal_events
  where id = v_event_id and user_id = v_user_id
  for update;

  if v_event.id is null then
    raise exception 'NOT_FOUND';
  end if;

  if p_expected_revision is null or v_event.revision <> p_expected_revision then
    insert into public.offline_conflicts (
      user_id, entity_type, entity_id, base_revision, server_revision, local_state, server_state
    ) values (
      v_user_id,
      'personal_event',
      v_event_id,
      coalesce(p_expected_revision, 1),
      v_event.revision,
      p_event,
      to_jsonb(v_event)
    ) returning id into v_conflict_id;
    return jsonb_build_object('status', 'conflict', 'conflict_id', v_conflict_id, 'server', to_jsonb(v_event));
  end if;

  update public.personal_events
  set title = case when p_event ? 'title' then btrim(p_event ->> 'title') else title end,
      start_at = case when p_event ? 'start_at' then (p_event ->> 'start_at')::timestamptz else start_at end,
      end_at = case when p_event ? 'end_at' then (p_event ->> 'end_at')::timestamptz else end_at end,
      all_day = case when p_event ? 'all_day' then (p_event ->> 'all_day')::boolean else all_day end,
      attrs = case when p_event ? 'attrs' then coalesce(p_event -> 'attrs', '{}'::jsonb) else attrs end,
      reminder_minutes = case when p_event ? 'reminder_minutes' then nullif(p_event ->> 'reminder_minutes', '')::integer else reminder_minutes end,
      deleted_at = case when p_event ? 'deleted_at' then nullif(p_event ->> 'deleted_at', '')::timestamptz else deleted_at end
  where id = v_event_id
  returning * into v_event;

  return jsonb_build_object('status', 'applied', 'event', to_jsonb(v_event));
end;
$$;

create or replace function public.resolve_offline_conflict(
  p_conflict_id uuid,
  p_resolution public.aiau_offline_resolution
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_conflict public.offline_conflicts%rowtype;
  v_event public.personal_events%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_conflict
  from public.offline_conflicts
  where id = p_conflict_id and user_id = v_user_id
  for update;

  if v_conflict.id is null then
    raise exception 'NOT_FOUND';
  end if;
  if v_conflict.status = 'resolved' then
    return jsonb_build_object('status', 'resolved', 'resolution', v_conflict.resolution);
  end if;
  if v_conflict.entity_type <> 'personal_event' then
    raise exception 'UNSUPPORTED_ENTITY';
  end if;

  if p_resolution = 'local' then
    update public.personal_events
    set title = v_conflict.local_state ->> 'title',
        start_at = (v_conflict.local_state ->> 'start_at')::timestamptz,
        end_at = (v_conflict.local_state ->> 'end_at')::timestamptz,
        all_day = coalesce((v_conflict.local_state ->> 'all_day')::boolean, false),
        attrs = coalesce(v_conflict.local_state -> 'attrs', '{}'::jsonb),
        reminder_minutes = nullif(v_conflict.local_state ->> 'reminder_minutes', '')::integer,
        deleted_at = nullif(v_conflict.local_state ->> 'deleted_at', '')::timestamptz
    where id = v_conflict.entity_id and user_id = v_user_id
    returning * into v_event;
  else
    select * into v_event
    from public.personal_events
    where id = v_conflict.entity_id and user_id = v_user_id;
  end if;

  update public.offline_conflicts
  set status = 'resolved', resolution = p_resolution, resolved_at = now()
  where id = p_conflict_id;

  return jsonb_build_object('status', 'resolved', 'resolution', p_resolution, 'event', to_jsonb(v_event));
end;
$$;

create or replace function public.create_share_link(p_plan_id uuid, p_expires_at timestamptz default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not private.aiau_is_plan_member(p_plan_id) then
    raise exception 'NOT_A_MEMBER';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.share_links (plan_id, token_hash, created_by, expires_at)
  values (p_plan_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_user_id, p_expires_at);
  return v_token;
end;
$$;

create or replace function public.revoke_share_link(p_share_link_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
begin
  select plan_id into v_plan_id from public.share_links where id = p_share_link_id;
  if v_plan_id is null then
    raise exception 'NOT_FOUND';
  end if;
  if not private.aiau_is_plan_member(v_plan_id) then
    raise exception 'NOT_A_MEMBER';
  end if;
  update public.share_links set revoked_at = now() where id = p_share_link_id;
end;
$$;

create or replace function public.get_public_plan(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_plan_id uuid;
  v_trip public.trips%rowtype;
  v_window timestamptz := date_trunc('minute', now());
  v_count integer;
begin
  v_hash := encode(extensions.digest(p_share_token, 'sha256'), 'hex');

  insert into public.public_rate_limits (token_hash, window_start, request_count, expires_at)
  values (v_hash, v_window, 1, v_window + interval '2 minutes')
  on conflict (token_hash, window_start) do update
  set request_count = public.public_rate_limits.request_count + 1
  returning request_count into v_count;

  if v_count > 60 then
    raise exception 'RATE_LIMITED';
  end if;

  select sl.plan_id into v_plan_id
  from public.share_links sl
  where sl.token_hash = v_hash
    and sl.revoked_at is null
    and (sl.expires_at is null or sl.expires_at > now());

  if v_plan_id is null then
    raise exception 'NOT_FOUND';
  end if;

  select t.* into v_trip
  from public.trips t
  join public.plans p on p.trip_id = t.id
  where p.id = v_plan_id;

  return jsonb_build_object(
    'trip', jsonb_build_object(
      'id', v_trip.id,
      'title', v_trip.title,
      'starts_at', v_trip.starts_at,
      'ends_at', v_trip.ends_at,
      'timezone', v_trip.timezone
    ),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', po.id,
        'title', po.title,
        'start_at', po.start_at,
        'end_at', po.end_at,
        'kind', po.kind,
        'attrs', po.attrs
      ) order by po.start_at)
      from public.plan_options po
      join public.plan_slots ps on ps.id = po.slot_id
      where ps.plan_id = v_plan_id
        and ps.status = 'confirmed'
        and ps.confirmed_option_id = po.id
        and ps.deleted_at is null
        and po.deleted_at is null
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.enqueue_due_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  insert into public.notifications (user_id, type, title, body, link, dedupe_key)
  select pe.user_id,
         'reminder',
         '予定のリマインド: ' || pe.title,
         null,
         '/calendar',
         'reminder:' || pe.id || ':' || pe.start_at
  from public.personal_events pe
  join public.profiles pr on pr.id = pe.user_id
  where pe.deleted_at is null
    and pe.start_at > now()
    and pe.start_at <= now() + make_interval(mins => coalesce(pe.reminder_minutes, pr.default_reminder_minutes))
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function private.aiau_plan_snapshot(uuid) from public, anon, authenticated;
revoke all on function private.aiau_record_plan_version(uuid, uuid, text, text) from public, anon, authenticated;

revoke all on function public.create_trip(text, text, timestamptz, timestamptz, text, text, numeric, text) from public, anon;
revoke all on function public.join_trip(text, text) from public, anon;
revoke all on function public.create_trip_invite(uuid, timestamptz) from public, anon;
revoke all on function public.revoke_trip_invite(uuid) from public, anon;
revoke all on function public.apply_note_operations(uuid, uuid, jsonb) from public, anon;
revoke all on function public.undo_note_operation(uuid) from public, anon;
revoke all on function public.apply_plan_command(uuid, integer, jsonb) from public, anon;
revoke all on function public.cast_vote(uuid, uuid) from public, anon;
revoke all on function public.confirm_option(uuid, uuid, integer) from public, anon;
revoke all on function public.restore_plan_version(uuid, integer, integer) from public, anon;
revoke all on function public.get_calendar_feed(timestamptz, timestamptz, text) from public, anon;
revoke all on function public.upsert_personal_event(jsonb, bigint) from public, anon;
revoke all on function public.resolve_offline_conflict(uuid, public.aiau_offline_resolution) from public, anon;
revoke all on function public.create_share_link(uuid, timestamptz) from public, anon;
revoke all on function public.revoke_share_link(uuid) from public, anon;
revoke all on function public.get_public_plan(text) from public, anon, authenticated;
revoke all on function public.enqueue_due_reminders() from public, anon, authenticated;

grant execute on function public.create_trip(text, text, timestamptz, timestamptz, text, text, numeric, text) to authenticated;
grant execute on function public.join_trip(text, text) to authenticated;
grant execute on function public.create_trip_invite(uuid, timestamptz) to authenticated;
grant execute on function public.revoke_trip_invite(uuid) to authenticated;
grant execute on function public.apply_note_operations(uuid, uuid, jsonb) to authenticated;
grant execute on function public.undo_note_operation(uuid) to authenticated;
grant execute on function public.apply_plan_command(uuid, integer, jsonb) to authenticated;
grant execute on function public.cast_vote(uuid, uuid) to authenticated;
grant execute on function public.confirm_option(uuid, uuid, integer) to authenticated;
grant execute on function public.restore_plan_version(uuid, integer, integer) to authenticated;
grant execute on function public.get_calendar_feed(timestamptz, timestamptz, text) to authenticated;
grant execute on function public.upsert_personal_event(jsonb, bigint) to authenticated;
grant execute on function public.resolve_offline_conflict(uuid, public.aiau_offline_resolution) to authenticated;
grant execute on function public.create_share_link(uuid, timestamptz) to authenticated;
grant execute on function public.revoke_share_link(uuid) to authenticated;
grant execute on function public.get_public_plan(text) to service_role;
grant execute on function public.enqueue_due_reminders() to service_role;
