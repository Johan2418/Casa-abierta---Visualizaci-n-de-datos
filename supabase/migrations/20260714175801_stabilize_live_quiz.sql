-- Estabilización del quiz en vivo. Esta migración es aditiva y puede aplicarse
-- después de las migraciones de optimización ya existentes.

alter table public.quiz_sessions
  drop constraint if exists quiz_sessions_status_check;
alter table public.quiz_sessions
  add constraint quiz_sessions_status_check
  check (status in ('lobby', 'question', 'paused', 'reveal', 'finished', 'cancelled'));

create index if not exists quiz_sessions_active_host_idx
  on public.quiz_sessions (host_user_id, created_at desc)
  where status in ('lobby', 'question', 'paused', 'reveal');
create index if not exists quiz_sessions_host_created_idx
  on public.quiz_sessions (host_user_id, created_at desc);

create or replace function private.quiz_is_host(p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.quiz_sessions s
    where s.id = p_session_id and s.host_user_id = (select auth.uid())
  );
$$;

create or replace function private.quiz_is_member(p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    private.quiz_is_host(p_session_id) or exists (
      select 1 from public.quiz_participants p
      where p.session_id = p_session_id and p.user_id = (select auth.uid())
    )
  );
$$;

create or replace function private.quiz_emit(p_topic text, p_event text, p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(p_payload, p_event, p_topic, true);
exception when undefined_function then
  null;
end;
$$;

create or replace function private.quiz_emit_phase(p_code text, p_status text, p_current_question integer, p_closes_at timestamptz, p_reveal_until timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare v_payload jsonb := jsonb_build_object(
  'status', p_status,
  'currentQuestion', p_current_question,
  'closesAt', p_closes_at,
  'revealUntil', p_reveal_until
);
begin
  -- Compatibilidad temporal con el frontend anterior.
  perform private.quiz_emit('quiz:' || p_code, 'state', jsonb_build_object('code', p_code));
  perform private.quiz_emit('quiz:' || p_code || ':players', 'phase', v_payload);
  perform private.quiz_emit('quiz:' || p_code || ':host', 'phase', v_payload);
end;
$$;

create or replace function private.quiz_can_subscribe_realtime(p_topic text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.quiz_sessions s
    where s.code = split_part(p_topic, ':', 2)
      and p_topic in ('quiz:' || s.code, 'quiz:' || s.code || ':host', 'quiz:' || s.code || ':players')
      and (
        (p_topic = 'quiz:' || s.code || ':host' and s.host_user_id = (select auth.uid()))
        or (p_topic in ('quiz:' || s.code, 'quiz:' || s.code || ':players') and private.quiz_is_member(s.id))
      )
  );
$$;

drop policy if exists quiz_members_receive_state on realtime.messages;
create policy quiz_members_receive_state on realtime.messages for select to authenticated using (
  realtime.messages.extension = 'broadcast'
  and (select private.quiz_can_subscribe_realtime(realtime.topic()))
);

create or replace function public.quiz_public_state(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'code', s.code, 'status', s.status, 'currentQuestion', s.current_question,
    'openedAt', s.opened_at, 'closesAt', s.closes_at, 'revealUntil', s.reveal_until,
    'questionDurationMs', s.question_duration_seconds * 1000,
    'answeredCount', (select count(*) from public.quiz_answers a where a.session_id = s.id and a.question_position = s.current_question),
    'participantCount', (select count(*) from public.quiz_participants p where p.session_id = s.id),
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
      'position', sq.position, 'id', q.id, 'prompt', q.prompt,
      'options', (select jsonb_agg(o.item order by ord.ordinality) from jsonb_array_elements_text(sq.option_order) with ordinality ord(id, ordinality) join lateral (select value as item from jsonb_array_elements(q.options) where value->>'id' = ord.id) o on true),
      'correctOptionId', case when s.status in ('reveal','finished') and sq.position = s.current_question then q.correct_option_id else null end,
      'explanation', case when s.status in ('reveal','finished') and sq.position = s.current_question then q.explanation else null end
    ) order by sq.position) from public.quiz_session_questions sq join public.quiz_questions q on q.id = sq.question_id where sq.session_id = s.id), '[]'::jsonb),
    'participants', coalesce((select jsonb_agg(jsonb_build_object('alias', ranked.alias, 'score', ranked.score, 'correctCount', ranked.correct_count, 'responseMs', ranked.response_ms, 'joinedAt', ranked.joined_at, 'rank', ranked.rank) order by ranked.rank) from (
      select p.*, row_number() over(order by p.score desc, p.correct_count desc, p.response_ms asc, p.joined_at asc) as rank from public.quiz_participants p where p.session_id = s.id
    ) ranked), '[]'::jsonb)
  ) into result from public.quiz_sessions s where s.id = p_session_id;
  return result;
end;
$$;

create or replace function public.quiz_get_host_state(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from public.quiz_sessions where code = upper(p_code);
  if v_id is null or not private.quiz_is_host(v_id) then raise exception 'No puedes controlar esta sesión.'; end if;
  return public.quiz_public_state(v_id);
end;
$$;

create or replace function public.quiz_get_active_host_session()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select s.id into v_id from public.quiz_sessions s
  where s.host_user_id = (select auth.uid()) and s.status in ('lobby', 'question', 'paused', 'reveal')
  order by s.created_at desc limit 1;
  if v_id is null then return null; end if;
  return public.quiz_public_state(v_id);
end;
$$;

create or replace function public.quiz_get_player_state(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session public.quiz_sessions%rowtype; v_question jsonb; v_me jsonb;
begin
  select * into v_session from public.quiz_sessions where code = upper(p_code);
  if not found or not private.quiz_is_member(v_session.id) then raise exception 'Sesión no disponible.'; end if;
  select jsonb_build_object(
    'position', sq.position, 'id', q.id, 'prompt', q.prompt,
    'options', (select jsonb_agg(o.item order by ord.ordinality) from jsonb_array_elements_text(sq.option_order) with ordinality ord(id, ordinality) join lateral (select value as item from jsonb_array_elements(q.options) where value->>'id' = ord.id) o on true),
    'correctOptionId', case when v_session.status in ('reveal','finished') then q.correct_option_id else null end,
    'explanation', case when v_session.status in ('reveal','finished') then q.explanation else null end
  ) into v_question from public.quiz_session_questions sq join public.quiz_questions q on q.id=sq.question_id where sq.session_id=v_session.id and sq.position=v_session.current_question;
  select jsonb_build_object('alias', ranked.alias, 'score', ranked.score, 'rank', ranked.rank) into v_me from (
    select p.*, row_number() over(order by p.score desc, p.correct_count desc, p.response_ms asc, p.joined_at asc) as rank from public.quiz_participants p where p.session_id=v_session.id
  ) ranked where ranked.user_id=(select auth.uid());
  return jsonb_build_object(
    'code', v_session.code, 'status', v_session.status, 'currentQuestion', v_session.current_question,
    'openedAt', v_session.opened_at, 'closesAt', v_session.closes_at, 'revealUntil', v_session.reveal_until,
    'questionDurationMs', v_session.question_duration_seconds * 1000,
    'participantCount', (select count(*) from public.quiz_participants where session_id=v_session.id),
    'myAnswered', exists(select 1 from public.quiz_answers where session_id=v_session.id and user_id=(select auth.uid()) and question_position=v_session.current_question),
    'question', v_question, 'me', coalesce(v_me, '{}'::jsonb)
  );
end;
$$;

create or replace function public.quiz_join_session(p_code text, p_alias text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session public.quiz_sessions%rowtype; v_alias text := btrim(p_alias); v_count integer;
begin
  select * into v_session from public.quiz_sessions where code=upper(p_code) for update;
  if not found then raise exception 'Sesión no encontrada.'; end if;
  if v_session.status <> 'lobby' then raise exception 'La partida ya comenzó.'; end if;
  if (select auth.uid()) is null or char_length(v_alias) not between 2 and 20 then raise exception 'Alias inválido.'; end if;
  insert into public.quiz_participants(session_id,user_id,alias) values(v_session.id,(select auth.uid()),v_alias)
  on conflict (session_id,user_id) do update set alias=excluded.alias;
  select count(*) into v_count from public.quiz_participants where session_id=v_session.id;
  perform private.quiz_emit('quiz:' || v_session.code || ':host', 'lobby', jsonb_build_object('participantCount', v_count));
  perform private.quiz_emit('quiz:' || v_session.code || ':players', 'lobby', jsonb_build_object('participantCount', v_count));
  perform private.quiz_emit('quiz:' || v_session.code, 'state', jsonb_build_object('code', v_session.code));
  return public.quiz_get_player_state(v_session.code);
exception when unique_violation then raise exception 'Ese alias ya está en uso en esta sesión.';
end;
$$;

create or replace function public.quiz_submit_answer(p_code text, p_option_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session public.quiz_sessions%rowtype; v_correct text; v_remaining integer; v_response integer; v_points integer; v_is_correct boolean; v_count integer; v_option_valid boolean;
begin
  -- FOR SHARE permite que jugadores distintos respondan en paralelo y bloquea
  -- el cambio de fase hasta que las respuestas en curso terminen.
  select * into v_session from public.quiz_sessions where code=upper(p_code) for share;
  if not found or v_session.status <> 'question' or now() > v_session.closes_at then raise exception 'El tiempo de respuesta terminó.'; end if;
  if not private.quiz_is_member(v_session.id) or private.quiz_is_host(v_session.id) then raise exception 'No perteneces a esta sesión.'; end if;
  select q.correct_option_id, exists(select 1 from jsonb_array_elements(q.options) option where option->>'id' = p_option_id)
  into v_correct, v_option_valid
  from public.quiz_session_questions sq join public.quiz_questions q on q.id=sq.question_id
  where sq.session_id=v_session.id and sq.position=v_session.current_question;
  if not coalesce(v_option_valid, false) then raise exception 'Opción inválida.'; end if;
  v_remaining:=greatest(0,floor(extract(epoch from (v_session.closes_at-now()))*1000)::int);
  v_response:=v_session.question_duration_seconds * 1000-v_remaining;
  v_is_correct:=p_option_id=v_correct;
  v_points:=case when v_is_correct then 500+floor(500*v_remaining/(v_session.question_duration_seconds*1000.0))::int else 0 end;
  insert into public.quiz_answers(session_id,user_id,question_position,selected_option_id,response_ms,points,is_correct)
  values(v_session.id,(select auth.uid()),v_session.current_question,p_option_id,v_response,v_points,v_is_correct)
  on conflict do nothing;
  if not found then return public.quiz_get_player_state(v_session.code); end if;
  update public.quiz_participants set score=score+v_points, correct_count=correct_count+case when v_is_correct then 1 else 0 end, response_ms=response_ms+v_response
  where session_id=v_session.id and user_id=(select auth.uid());
  select count(*) into v_count from public.quiz_answers where session_id=v_session.id and question_position=v_session.current_question;
  perform private.quiz_emit('quiz:' || v_session.code || ':host', 'answer', jsonb_build_object('questionIndex', v_session.current_question, 'answeredCount', v_count));
  return public.quiz_get_player_state(v_session.code);
end;
$$;

create or replace function public.quiz_cancel_session(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session public.quiz_sessions%rowtype;
begin
  select * into v_session from public.quiz_sessions where code = upper(p_code) for update;
  if not found or not private.quiz_is_host(v_session.id) then raise exception 'No puedes controlar esta sesión.'; end if;
  if v_session.status not in ('lobby', 'question', 'paused', 'reveal') then raise exception 'La sesión ya terminó.'; end if;
  update public.quiz_sessions set status='cancelled', finished_at=now(), closes_at=null, reveal_until=null where id=v_session.id returning * into v_session;
  perform private.quiz_emit_phase(v_session.code, v_session.status, v_session.current_question, v_session.closes_at, v_session.reveal_until);
  return public.quiz_public_state(v_session.id);
end;
$$;

create or replace function public.quiz_tick_session(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session public.quiz_sessions%rowtype; v_next integer;
begin
  select * into v_session from public.quiz_sessions where code=upper(p_code) for update;
  if not found or not private.quiz_is_host(v_session.id) then raise exception 'No puedes controlar esta sesión.'; end if;
  if v_session.status='question' and now() >= v_session.closes_at then
    update public.quiz_sessions set status='reveal', reveal_until=now()+interval '6 seconds' where id=v_session.id returning * into v_session;
  elsif v_session.status='reveal' and now() >= v_session.reveal_until then
    v_next:=v_session.current_question+1;
    if v_next=8 then
      update public.quiz_sessions set status='finished', finished_at=now() where id=v_session.id returning * into v_session;
      if v_session.question_duration_seconds = 20 then
        insert into public.quiz_global_scores(user_id,alias,score,correct_count,response_ms,achieved_at,source_session_id)
        select user_id,alias,score,correct_count,response_ms,now(),v_session.id from public.quiz_participants where session_id=v_session.id
        on conflict(user_id) do update set alias=excluded.alias, score=excluded.score, correct_count=excluded.correct_count, response_ms=excluded.response_ms, achieved_at=excluded.achieved_at, source_session_id=excluded.source_session_id
        where excluded.score>public.quiz_global_scores.score or (excluded.score=public.quiz_global_scores.score and (excluded.correct_count>public.quiz_global_scores.correct_count or (excluded.correct_count=public.quiz_global_scores.correct_count and excluded.response_ms<public.quiz_global_scores.response_ms)));
      end if;
    else
      update public.quiz_sessions set status='question', current_question=v_next, opened_at=now(), closes_at=now()+make_interval(secs => question_duration_seconds), reveal_until=null where id=v_session.id returning * into v_session;
    end if;
  else
    return public.quiz_public_state(v_session.id);
  end if;
  perform private.quiz_emit_phase(v_session.code, v_session.status, v_session.current_question, v_session.closes_at, v_session.reveal_until);
  return public.quiz_public_state(v_session.id);
end;
$$;

create or replace function public.quiz_get_state(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from public.quiz_sessions where code=upper(p_code);
  if v_id is null or not private.quiz_is_member(v_id) then raise exception 'Sesión no disponible.'; end if;
  return public.quiz_public_state(v_id);
end;
$$;

revoke all on function private.quiz_is_host(uuid), private.quiz_is_member(uuid), private.quiz_emit(text,text,jsonb), private.quiz_emit_phase(text,text,integer,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function private.quiz_can_subscribe_realtime(text) from public, anon;
grant execute on function private.quiz_can_subscribe_realtime(text) to authenticated;
revoke all on function public.quiz_public_state(uuid) from public, anon, authenticated;
revoke all on function public.quiz_get_active_host_session(), public.quiz_cancel_session(text) from public, anon;
grant execute on function public.quiz_get_active_host_session(), public.quiz_cancel_session(text) to authenticated;
