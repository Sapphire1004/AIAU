-- 競合のない予定（有効な案が 1 つだけの slot）が status='open' のままとなり、
-- get_calendar_feed / export-ics / public-plan（いずれも status='confirmed' で絞る）へ
-- 一切反映されない問題の修正。
--
-- 背景: #36 で「投票ボタンは競合候補のみ」となり、競合のない予定は投票・確定の
-- 操作自体が存在しない。画面 2 は確定行に表示するが DB 上は open のままのため、
-- カレンダーには投票で確定した予定しか出ない。
--
-- 対応: apply_plan_command の末尾で「有効な案が 1 つだけの open slot」を自動確定する。
-- 明示的な確定解除（unconfirm）だけは尊重し、その呼び出しでは再確定しない。

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

  -- 競合が存在しない slot（有効な案が 1 つだけ）は投票の対象にならないため自動確定し、
  -- カレンダー・ICS・共有リンクへ反映されるようにする（画面 2 の確定行表示と一致させる）。
  -- 明示的な確定解除（unconfirm）だけはユーザーの意思を尊重して再確定しない。
  if v_type <> 'unconfirm' then
    update public.plan_slots ps
    set status = 'confirmed', confirmed_option_id = single_option.option_id
    from (
      select po.slot_id, min(po.id::text)::uuid as option_id
      from public.plan_options po
      where po.deleted_at is null
      group by po.slot_id
      having count(*) = 1
    ) single_option
    where ps.id = single_option.slot_id
      and ps.plan_id = p_plan_id
      and ps.deleted_at is null
      and ps.status = 'open';
  end if;

  v_version := private.aiau_record_plan_version(p_plan_id, v_user_id, v_source, v_summary);
  return jsonb_build_object('version', v_version, 'snapshot', private.aiau_plan_snapshot(p_plan_id));
end;
$$;

-- 既存データの補正: 既に「有効な案が 1 つだけ」で open のままの slot を確定させる
-- （これまでに生成済みのプランをカレンダーへ反映させるための一回限りの backfill）。
update public.plan_slots ps
set status = 'confirmed', confirmed_option_id = single_option.option_id
from (
  select po.slot_id, min(po.id::text)::uuid as option_id
  from public.plan_options po
  where po.deleted_at is null
  group by po.slot_id
  having count(*) = 1
) single_option
where ps.id = single_option.slot_id
  and ps.deleted_at is null
  and ps.status = 'open';
