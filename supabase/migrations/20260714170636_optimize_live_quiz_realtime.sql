-- Optimización aditiva del quiz en vivo. Mantiene quiz_get_state y quiz:<code>
-- durante el despliegue, pero los clientes nuevos usan estados y temas separados.
alter table public.quiz_sessions
  add column if not exists question_duration_seconds smallint not null default 20
  check (question_duration_seconds between 5 and 120);

alter table public.quiz_global_scores
  add column if not exists source_session_id uuid references public.quiz_sessions(id) on delete set null;

create index if not exists quiz_answers_session_question_idx
  on public.quiz_answers (session_id, question_position);
create index if not exists quiz_global_scores_rank_idx
  on public.quiz_global_scores (score desc, correct_count desc, response_ms asc, achieved_at asc);
create index if not exists quiz_session_questions_question_id_idx
  on public.quiz_session_questions (question_id);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.quiz_is_host(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public, private as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.quiz_sessions s where s.id = p_session_id and s.host_user_id = (select auth.uid())
  );
$$;

create or replace function private.quiz_is_member(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public, private as $$
  select (select auth.uid()) is not null and (
    private.quiz_is_host(p_session_id) or exists (
      select 1 from public.quiz_participants p where p.session_id = p_session_id and p.user_id = (select auth.uid())
    )
  );
$$;

create or replace function private.quiz_emit(p_topic text, p_event text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  perform realtime.send(p_payload, p_event, p_topic, true);
exception when undefined_function then
  null;
end;
$$;

create or replace function private.quiz_emit_phase(p_code text, p_status text, p_current_question integer, p_closes_at timestamptz, p_reveal_until timestamptz)
returns void language plpgsql security definer set search_path = public, private as $$
declare v_payload jsonb := jsonb_build_object(
  'status', p_status,
  'currentQuestion', p_current_question,
  'closesAt', p_closes_at,
  'revealUntil', p_reveal_until
);
begin
  -- Canal histórico para clientes anteriores durante el despliegue.
  perform private.quiz_emit('quiz:' || p_code, 'state', jsonb_build_object('code', p_code));
  perform private.quiz_emit('quiz:' || p_code || ':players', 'phase', v_payload);
  perform private.quiz_emit('quiz:' || p_code || ':host', 'phase', v_payload);
end;
$$;

create or replace function private.quiz_can_subscribe_realtime(p_topic text)
returns boolean language sql stable security definer set search_path = public, private as $$
  select exists (
    select 1 from public.quiz_sessions s
    where (
      (p_topic = 'quiz:' || s.code || ':host' and s.host_user_id = (select auth.uid()))
      or (p_topic in ('quiz:' || s.code, 'quiz:' || s.code || ':players') and private.quiz_is_member(s.id))
    )
  );
$$;

grant execute on function private.quiz_is_host(uuid), private.quiz_is_member(uuid), private.quiz_can_subscribe_realtime(text) to authenticated;
revoke all on function private.quiz_emit(text, text, jsonb), private.quiz_emit_phase(text, text, integer, timestamptz, timestamptz) from public, anon, authenticated;

drop policy if exists quiz_members_receive_state on realtime.messages;
create policy quiz_members_receive_state on realtime.messages for select to authenticated using (
  (select private.quiz_can_subscribe_realtime(realtime.topic()))
);

create or replace function public.quiz_public_state(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'code', s.code, 'status', s.status, 'currentQuestion', s.current_question,
    'openedAt', s.opened_at, 'closesAt', s.closes_at, 'revealUntil', s.reveal_until,
    'questionDurationMs', s.question_duration_seconds * 1000,
    'answeredCount', (select count(*) from quiz_answers a where a.session_id = s.id and a.question_position = s.current_question),
    'participantCount', (select count(*) from quiz_participants p where p.session_id = s.id),
    'myAnswered', exists(select 1 from quiz_answers a where a.session_id = s.id and a.user_id = (select auth.uid()) and a.question_position = s.current_question),
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
      'position', sq.position, 'id', q.id, 'prompt', q.prompt,
      'options', (select jsonb_agg(o.item order by ord.ordinality) from jsonb_array_elements_text(sq.option_order) with ordinality ord(id, ordinality) join lateral (select value as item from jsonb_array_elements(q.options) where value->>'id' = ord.id) o on true),
      'correctOptionId', case when s.status in ('reveal','finished') and sq.position = s.current_question then q.correct_option_id else null end,
      'explanation', case when s.status in ('reveal','finished') and sq.position = s.current_question then q.explanation else null end
    ) order by sq.position) from quiz_session_questions sq join quiz_questions q on q.id = sq.question_id where sq.session_id = s.id), '[]'::jsonb),
    'participants', coalesce((select jsonb_agg(jsonb_build_object('id', ranked.user_id, 'alias', ranked.alias, 'score', ranked.score, 'correctCount', ranked.correct_count, 'responseMs', ranked.response_ms, 'joinedAt', ranked.joined_at, 'rank', ranked.rank) order by ranked.rank) from (
      select p.*, row_number() over(order by p.score desc, p.correct_count desc, p.response_ms asc, p.joined_at asc) as rank from quiz_participants p where p.session_id = s.id
    ) ranked), '[]'::jsonb)
  ) into result from quiz_sessions s where s.id = p_session_id;
  return result;
end;
$$;

create or replace function public.quiz_get_host_state(p_code text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare v_id uuid;
begin
  select id into v_id from quiz_sessions where code = upper(p_code);
  if v_id is null or not private.quiz_is_host(v_id) then raise exception 'No puedes controlar esta sesión.'; end if;
  return public.quiz_public_state(v_id);
end;
$$;

create or replace function public.quiz_get_player_state(p_code text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare v_session quiz_sessions%rowtype; v_question jsonb; v_me jsonb;
begin
  select * into v_session from quiz_sessions where code = upper(p_code);
  if not found or not private.quiz_is_member(v_session.id) then raise exception 'Sesión no disponible.'; end if;
  select jsonb_build_object(
    'position', sq.position, 'id', q.id, 'prompt', q.prompt,
    'options', (select jsonb_agg(o.item order by ord.ordinality) from jsonb_array_elements_text(sq.option_order) with ordinality ord(id, ordinality) join lateral (select value as item from jsonb_array_elements(q.options) where value->>'id' = ord.id) o on true),
    'correctOptionId', case when v_session.status in ('reveal','finished') then q.correct_option_id else null end,
    'explanation', case when v_session.status in ('reveal','finished') then q.explanation else null end
  ) into v_question from quiz_session_questions sq join quiz_questions q on q.id=sq.question_id where sq.session_id=v_session.id and sq.position=v_session.current_question;
  select jsonb_build_object('score', ranked.score, 'rank', ranked.rank) into v_me from (
    select p.*, row_number() over(order by p.score desc, p.correct_count desc, p.response_ms asc, p.joined_at asc) as rank from quiz_participants p where p.session_id=v_session.id
  ) ranked where ranked.user_id=(select auth.uid());
  return jsonb_build_object(
    'code', v_session.code, 'status', v_session.status, 'currentQuestion', v_session.current_question,
    'openedAt', v_session.opened_at, 'closesAt', v_session.closes_at, 'revealUntil', v_session.reveal_until,
    'questionDurationMs', v_session.question_duration_seconds * 1000,
    'participantCount', (select count(*) from quiz_participants where session_id=v_session.id),
    'myAnswered', exists(select 1 from quiz_answers where session_id=v_session.id and user_id=(select auth.uid()) and question_position=v_session.current_question),
    'question', v_question, 'me', coalesce(v_me, '{}'::jsonb)
  );
end;
$$;

create or replace function public.quiz_set_question_duration(p_code text, p_seconds integer)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare v_session quiz_sessions%rowtype;
begin
  if p_seconds not between 5 and 120 then raise exception 'La duración debe estar entre 5 y 120 segundos.'; end if;
  select * into v_session from quiz_sessions where code=upper(p_code) for update;
  if not found or not private.quiz_is_host(v_session.id) then raise exception 'No puedes controlar esta sesión.'; end if;
  if v_session.status <> 'lobby' then raise exception 'La duración solo puede cambiarse en el lobby.'; end if;
  update quiz_sessions set question_duration_seconds=p_seconds where id=v_session.id;
  perform private.quiz_emit('quiz:' || v_session.code || ':host', 'lobby', jsonb_build_object('participantCount', (select count(*) from quiz_participants where session_id=v_session.id), 'questionDurationMs', p_seconds * 1000));
  return public.quiz_public_state(v_session.id);
end;
$$;

create or replace function public.quiz_join_session(p_code text, p_alias text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare v_session quiz_sessions%rowtype; v_alias text := btrim(p_alias); v_count integer;
begin
  select * into v_session from quiz_sessions where code=upper(p_code) for update;
  if not found then raise exception 'Sesión no encontrada.'; end if;
  if v_session.status <> 'lobby' then raise exception 'La partida ya comenzó.'; end if;
  if (select auth.uid()) is null or char_length(v_alias) not between 2 and 20 then raise exception 'Alias inválido.'; end if;
  insert into quiz_participants(session_id,user_id,alias) values(v_session.id,(select auth.uid()),v_alias)
  on conflict (session_id,user_id) do update set alias=excluded.alias;
  select count(*) into v_count from quiz_participants where session_id=v_session.id;
  perform private.quiz_emit('quiz:' || v_session.code || ':host', 'lobby', jsonb_build_object('participantCount', v_count));
  perform private.quiz_emit('quiz:' || v_session.code, 'state', jsonb_build_object('code', v_session.code));
  return public.quiz_get_player_state(v_session.code);
exception when unique_violation then raise exception 'Ese alias ya está en uso en esta sesión.';
end;
$$;

create or replace function public.quiz_start_session(p_code text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare v_session quiz_sessions%rowtype;
begin
  select * into v_session from quiz_sessions where code=upper(p_code) for update;
  if not found or not private.quiz_is_host(v_session.id) then raise exception 'No puedes controlar esta sesión.'; end if;
  if v_session.status <> 'lobby' then raise exception 'La sesión no está en lobby.'; end if;
  if not exists(select 1 from quiz_participants where session_id=v_session.id) then raise exception 'Debe unirse al menos una persona.'; end if;
  update quiz_sessions set status='question', current_question=0, opened_at=now(), closes_at=now()+make_interval(secs => question_duration_seconds) where id=v_session.id returning * into v_session;
  perform private.quiz_emit_phase(v_session.code, v_session.status, v_session.current_question, v_session.closes_at, v_session.reveal_until);
  return public.quiz_public_state(v_session.id);
end;
$$;

create or replace function public.quiz_host_command(p_code text, p_command text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare v_session quiz_sessions%rowtype;
begin
  select * into v_session from quiz_sessions where code=upper(p_code) for update;
  if not found or not private.quiz_is_host(v_session.id) then raise exception 'No puedes controlar esta sesión.'; end if;
  if p_command='pause' and v_session.status='question' then
    update quiz_sessions set status='paused', paused_remaining_ms=greatest(0,floor(extract(epoch from (v_session.closes_at-now()))*1000)::int) where id=v_session.id returning * into v_session;
  elsif p_command='resume' and v_session.status='paused' then
    update quiz_sessions set status='question', closes_at=now()+(v_session.paused_remaining_ms||' milliseconds')::interval, paused_remaining_ms=null where id=v_session.id returning * into v_session;
  elsif p_command='close' and v_session.status in ('question','paused') then
    update quiz_sessions set status='reveal', reveal_until=now()+interval '6 seconds' where id=v_session.id returning * into v_session;
  else raise exception 'Ese comando no aplica al estado actual.'; end if;
  perform private.quiz_emit_phase(v_session.code, v_session.status, v_session.current_question, v_session.closes_at, v_session.reveal_until);
  return public.quiz_public_state(v_session.id);
end;
$$;

create or replace function public.quiz_submit_answer(p_code text, p_option_id text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare v_session quiz_sessions%rowtype; v_correct text; v_remaining integer; v_response integer; v_points integer; v_is_correct boolean; v_count integer;
begin
  select * into v_session from quiz_sessions where code=upper(p_code) for update;
  if not found or v_session.status <> 'question' or now() > v_session.closes_at then raise exception 'El tiempo de respuesta terminó.'; end if;
  if not private.quiz_is_member(v_session.id) or private.quiz_is_host(v_session.id) then raise exception 'No perteneces a esta sesión.'; end if;
  select q.correct_option_id into v_correct from quiz_session_questions sq join quiz_questions q on q.id=sq.question_id where sq.session_id=v_session.id and sq.position=v_session.current_question;
  v_remaining:=greatest(0,floor(extract(epoch from (v_session.closes_at-now()))*1000)::int);
  v_response:=v_session.question_duration_seconds * 1000-v_remaining;
  v_is_correct:=p_option_id=v_correct;
  v_points:=case when v_is_correct then 500+floor(500*v_remaining/(v_session.question_duration_seconds*1000.0))::int else 0 end;
  insert into quiz_answers(session_id,user_id,question_position,selected_option_id,response_ms,points,is_correct) values(v_session.id,(select auth.uid()),v_session.current_question,p_option_id,v_response,v_points,v_is_correct);
  update quiz_participants set score=score+v_points, correct_count=correct_count+case when v_is_correct then 1 else 0 end, response_ms=response_ms+v_response where session_id=v_session.id and user_id=(select auth.uid());
  select count(*) into v_count from quiz_answers where session_id=v_session.id and question_position=v_session.current_question;
  perform private.quiz_emit('quiz:' || v_session.code || ':host', 'answer', jsonb_build_object('questionIndex', v_session.current_question, 'answeredCount', v_count));
  return public.quiz_get_player_state(v_session.code);
exception when unique_violation then return public.quiz_get_player_state(v_session.code);
end;
$$;

create or replace function public.quiz_tick_session(p_code text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare v_session quiz_sessions%rowtype; v_next integer;
begin
  select * into v_session from quiz_sessions where code=upper(p_code) for update;
  if not found or not private.quiz_is_host(v_session.id) then raise exception 'No puedes controlar esta sesión.'; end if;
  if v_session.status='question' and now() >= v_session.closes_at then
    update quiz_sessions set status='reveal', reveal_until=now()+interval '6 seconds' where id=v_session.id returning * into v_session;
  elsif v_session.status='reveal' and now() >= v_session.reveal_until then
    v_next:=v_session.current_question+1;
    if v_next=8 then
      update quiz_sessions set status='finished', finished_at=now() where id=v_session.id returning * into v_session;
      insert into quiz_global_scores(user_id,alias,score,correct_count,response_ms,achieved_at,source_session_id)
      select user_id,alias,score,correct_count,response_ms,now(),v_session.id from quiz_participants where session_id=v_session.id
      on conflict(user_id) do update set alias=excluded.alias, score=excluded.score, correct_count=excluded.correct_count, response_ms=excluded.response_ms, achieved_at=excluded.achieved_at, source_session_id=excluded.source_session_id
      where excluded.score>quiz_global_scores.score or (excluded.score=quiz_global_scores.score and (excluded.correct_count>quiz_global_scores.correct_count or (excluded.correct_count=quiz_global_scores.correct_count and excluded.response_ms<quiz_global_scores.response_ms)));
    else
      update quiz_sessions set status='question', current_question=v_next, opened_at=now(), closes_at=now()+make_interval(secs => question_duration_seconds) where id=v_session.id returning * into v_session;
    end if;
  else
    return public.quiz_public_state(v_session.id);
  end if;
  perform private.quiz_emit_phase(v_session.code, v_session.status, v_session.current_question, v_session.closes_at, v_session.reveal_until);
  return public.quiz_public_state(v_session.id);
end;
$$;

-- La API histórica sigue disponible para instalaciones con el frontend anterior.
create or replace function public.quiz_get_state(p_code text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare v_id uuid;
begin
  select id into v_id from quiz_sessions where code=upper(p_code);
  if v_id is null or not private.quiz_is_member(v_id) then raise exception 'Sesión no disponible.'; end if;
  return public.quiz_public_state(v_id);
end;
$$;

revoke all on function public.quiz_emit_state(text), public.quiz_is_member(uuid), public.quiz_public_state(uuid) from public, anon, authenticated;
revoke all on function public.quiz_create_session(), public.quiz_join_session(text,text), public.quiz_start_session(text), public.quiz_host_command(text,text), public.quiz_submit_answer(text,text), public.quiz_tick_session(text), public.quiz_get_state(text), public.quiz_get_global_leaderboard() from public, anon;
revoke all on function public.quiz_get_host_state(text), public.quiz_get_player_state(text), public.quiz_set_question_duration(text,integer) from public, anon;
grant execute on function public.quiz_create_session(), public.quiz_join_session(text,text), public.quiz_start_session(text), public.quiz_host_command(text,text), public.quiz_submit_answer(text,text), public.quiz_tick_session(text), public.quiz_get_state(text), public.quiz_get_global_leaderboard(), public.quiz_get_host_state(text), public.quiz_get_player_state(text), public.quiz_set_question_duration(text,integer) to authenticated;
