-- Sembrando Datos · quiz en vivo. Aplicar con `supabase db push`.
create extension if not exists pgcrypto;

create table if not exists public.quiz_questions (
  id text primary key,
  category text not null,
  prompt text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_option_id text not null,
  explanation text not null,
  source_section text not null,
  dataset_version text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  host_user_id uuid not null,
  status text not null default 'lobby' check (status in ('lobby', 'question', 'paused', 'reveal', 'finished')),
  current_question integer not null default -1,
  opened_at timestamptz,
  closes_at timestamptz,
  reveal_until timestamptz,
  paused_remaining_ms integer,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.quiz_session_questions (
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  position integer not null check (position between 0 and 7),
  question_id text not null references public.quiz_questions(id),
  option_order jsonb not null,
  primary key (session_id, position)
);

create table if not exists public.quiz_participants (
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  user_id uuid not null,
  alias text not null check (char_length(alias) between 2 and 20),
  alias_key text generated always as (lower(alias)) stored,
  score integer not null default 0,
  correct_count integer not null default 0,
  response_ms integer not null default 0,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id),
  unique (session_id, alias_key)
);

create table if not exists public.quiz_answers (
  session_id uuid not null,
  user_id uuid not null,
  question_position integer not null check (question_position between 0 and 7),
  selected_option_id text not null,
  answered_at timestamptz not null default now(),
  response_ms integer not null,
  points integer not null,
  is_correct boolean not null,
  primary key (session_id, user_id, question_position),
  foreign key (session_id, user_id) references public.quiz_participants(session_id, user_id) on delete cascade
);

create table if not exists public.quiz_global_scores (
  user_id uuid primary key,
  alias text not null,
  score integer not null,
  correct_count integer not null,
  response_ms integer not null,
  achieved_at timestamptz not null default now()
);

alter table public.quiz_questions enable row level security;
alter table public.quiz_sessions enable row level security;
alter table public.quiz_session_questions enable row level security;
alter table public.quiz_participants enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.quiz_global_scores enable row level security;

-- No se da acceso directo a las tablas: las RPC siguientes devuelven solo el estado sanitizado.

create or replace function public.quiz_emit_state(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform realtime.send(jsonb_build_object('code', p_code), 'state', 'quiz:' || p_code, true);
exception when undefined_function then
  -- Permite desarrollo local sin Realtime; el cliente hace polling de respaldo.
  null;
end;
$$;

create or replace function public.quiz_is_member(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from quiz_sessions s where s.id = p_session_id and s.host_user_id = auth.uid())
      or exists (select 1 from quiz_participants p where p.session_id = p_session_id and p.user_id = auth.uid());
$$;

create or replace function public.quiz_public_state(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'code', s.code, 'status', s.status, 'currentQuestion', s.current_question,
    'openedAt', s.opened_at, 'closesAt', s.closes_at, 'revealUntil', s.reveal_until,
    'answeredCount', (select count(*) from quiz_answers a where a.session_id = s.id and a.question_position = s.current_question),
    'myAnswered', exists(select 1 from quiz_answers a where a.session_id = s.id and a.user_id = auth.uid() and a.question_position = s.current_question),
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

create or replace function public.quiz_create_session()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text; v_count integer;
begin
  if auth.uid() is null then raise exception 'Debes iniciar una identidad anónima.'; end if;
  if exists(select 1 from quiz_sessions where host_user_id = auth.uid() and status in ('lobby','question','paused','reveal')) then raise exception 'Ya tienes una sesión activa.'; end if;
  if (select count(*) from quiz_sessions where host_user_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then raise exception 'Límite de creación alcanzado. Intenta más tarde.'; end if;
  select count(*) into v_count from quiz_questions where active;
  if v_count < 24 then raise exception 'El banco de preguntas no está sincronizado.'; end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    v_code := translate(v_code, '01IO', '2345');
    exit when not exists(select 1 from quiz_sessions where code = v_code);
  end loop;
  insert into quiz_sessions(code, host_user_id) values(v_code, auth.uid()) returning id into v_id;
  with categorized as (
    select id, category, row_number() over(partition by category order by random()) as category_rank from quiz_questions where active
  ), chosen as (select id from categorized where category_rank <= 2 order by random() limit 8)
  insert into quiz_session_questions(session_id, position, question_id, option_order)
  select v_id, row_number() over() - 1, q.id, (select jsonb_agg(value->>'id' order by random()) from jsonb_array_elements(q.options) value)
  from quiz_questions q join chosen c on c.id = q.id order by random();
  if (select count(*) from quiz_session_questions where session_id = v_id) <> 8 then raise exception 'No se pudo seleccionar una ronda válida.'; end if;
  perform quiz_emit_state(v_code); return quiz_public_state(v_id);
end;
$$;

create or replace function public.quiz_join_session(p_code text, p_alias text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session quiz_sessions%rowtype; v_alias text := btrim(p_alias);
begin
  select * into v_session from quiz_sessions where code = upper(p_code) for update;
  if not found then raise exception 'Sesión no encontrada.'; end if;
  if v_session.status <> 'lobby' then raise exception 'La partida ya comenzó.'; end if;
  if auth.uid() is null or char_length(v_alias) not between 2 and 20 then raise exception 'Alias inválido.'; end if;
  insert into quiz_participants(session_id,user_id,alias) values(v_session.id,auth.uid(),v_alias)
  on conflict (session_id,user_id) do update set alias = excluded.alias;
  perform quiz_emit_state(v_session.code); return quiz_public_state(v_session.id);
exception when unique_violation then raise exception 'Ese alias ya está en uso en esta sesión.';
end;
$$;

create or replace function public.quiz_start_session(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session quiz_sessions%rowtype;
begin
  select * into v_session from quiz_sessions where code = upper(p_code) for update;
  if not found or v_session.host_user_id <> auth.uid() then raise exception 'No puedes controlar esta sesión.'; end if;
  if v_session.status <> 'lobby' then raise exception 'La sesión no está en lobby.'; end if;
  if not exists(select 1 from quiz_participants where session_id = v_session.id) then raise exception 'Debe unirse al menos una persona.'; end if;
  update quiz_sessions set status='question',current_question=0,opened_at=now(),closes_at=now()+interval '20 seconds' where id=v_session.id;
  perform quiz_emit_state(v_session.code); return quiz_public_state(v_session.id);
end;
$$;

create or replace function public.quiz_host_command(p_code text, p_command text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session quiz_sessions%rowtype;
begin
  select * into v_session from quiz_sessions where code=upper(p_code) for update;
  if not found or v_session.host_user_id <> auth.uid() then raise exception 'No puedes controlar esta sesión.'; end if;
  if p_command='pause' and v_session.status='question' then update quiz_sessions set status='paused', paused_remaining_ms=greatest(0, floor(extract(epoch from (v_session.closes_at-now()))*1000)::int) where id=v_session.id;
  elsif p_command='resume' and v_session.status='paused' then update quiz_sessions set status='question', closes_at=now()+(v_session.paused_remaining_ms||' milliseconds')::interval, paused_remaining_ms=null where id=v_session.id;
  elsif p_command='close' and v_session.status in ('question','paused') then update quiz_sessions set status='reveal',reveal_until=now()+interval '6 seconds' where id=v_session.id;
  else raise exception 'Ese comando no aplica al estado actual.'; end if;
  perform quiz_emit_state(v_session.code); return quiz_public_state(v_session.id);
end;
$$;

create or replace function public.quiz_submit_answer(p_code text, p_option_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session quiz_sessions%rowtype; v_correct text; v_remaining integer; v_response integer; v_points integer; v_is_correct boolean;
begin
  select * into v_session from quiz_sessions where code=upper(p_code) for update;
  if not found or v_session.status <> 'question' or now() > v_session.closes_at then raise exception 'El tiempo de respuesta terminó.'; end if;
  if not exists(select 1 from quiz_participants where session_id=v_session.id and user_id=auth.uid()) then raise exception 'No perteneces a esta sesión.'; end if;
  select q.correct_option_id into v_correct from quiz_session_questions sq join quiz_questions q on q.id=sq.question_id where sq.session_id=v_session.id and sq.position=v_session.current_question;
  v_remaining:=greatest(0,floor(extract(epoch from (v_session.closes_at-now()))*1000)::int); v_response:=20000-v_remaining; v_is_correct:=p_option_id=v_correct; v_points:=case when v_is_correct then 500+floor(500*v_remaining/20000.0)::int else 0 end;
  insert into quiz_answers(session_id,user_id,question_position,selected_option_id,response_ms,points,is_correct) values(v_session.id,auth.uid(),v_session.current_question,p_option_id,v_response,v_points,v_is_correct);
  update quiz_participants set score=score+v_points,correct_count=correct_count+case when v_is_correct then 1 else 0 end,response_ms=response_ms+v_response where session_id=v_session.id and user_id=auth.uid();
  perform quiz_emit_state(v_session.code); return quiz_public_state(v_session.id);
exception when unique_violation then return quiz_public_state(v_session.id);
end;
$$;

create or replace function public.quiz_tick_session(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session quiz_sessions%rowtype; v_next integer;
begin
  select * into v_session from quiz_sessions where code=upper(p_code) for update;
  if not found or not quiz_is_member(v_session.id) then raise exception 'Sesión no disponible.'; end if;
  if v_session.status='question' and now() >= v_session.closes_at then update quiz_sessions set status='reveal',reveal_until=now()+interval '6 seconds' where id=v_session.id;
  elsif v_session.status='reveal' and now() >= v_session.reveal_until then
    v_next:=v_session.current_question+1;
    if v_next=8 then
      update quiz_sessions set status='finished',finished_at=now() where id=v_session.id;
      insert into quiz_global_scores(user_id,alias,score,correct_count,response_ms,achieved_at)
      select user_id,alias,score,correct_count,response_ms,now() from quiz_participants where session_id=v_session.id
      on conflict(user_id) do update set alias=excluded.alias,score=excluded.score,correct_count=excluded.correct_count,response_ms=excluded.response_ms,achieved_at=excluded.achieved_at
      where excluded.score>quiz_global_scores.score or (excluded.score=quiz_global_scores.score and (excluded.correct_count>quiz_global_scores.correct_count or (excluded.correct_count=quiz_global_scores.correct_count and excluded.response_ms<quiz_global_scores.response_ms)));
    else update quiz_sessions set status='question',current_question=v_next,opened_at=now(),closes_at=now()+interval '20 seconds' where id=v_session.id; end if;
  else return quiz_public_state(v_session.id); end if;
  perform quiz_emit_state(v_session.code); return quiz_public_state(v_session.id);
end;
$$;

create or replace function public.quiz_get_state(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin select id into v_id from quiz_sessions where code=upper(p_code); if v_id is null or not quiz_is_member(v_id) then raise exception 'Sesión no disponible.'; end if; return quiz_public_state(v_id); end;
$$;

create or replace function public.quiz_get_global_leaderboard()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('alias',alias,'score',score,'correctCount',correct_count,'responseMs',response_ms,'achievedAt',achieved_at) order by score desc,correct_count desc,response_ms asc,achieved_at asc),'[]'::jsonb)
  from (select * from quiz_global_scores order by score desc,correct_count desc,response_ms asc,achieved_at asc limit 10) top_scores;
$$;

grant execute on function public.quiz_create_session(), public.quiz_get_global_leaderboard() to authenticated;
grant execute on function public.quiz_join_session(text,text), public.quiz_start_session(text), public.quiz_host_command(text,text), public.quiz_submit_answer(text,text), public.quiz_tick_session(text), public.quiz_get_state(text) to authenticated;

-- Canal privado: solo anfitrión o participante de la sesión puede escuchar `quiz:<código>`.
create or replace function public.quiz_can_subscribe_realtime(p_topic text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from quiz_sessions s
    where p_topic = 'quiz:' || s.code
      and (s.host_user_id = auth.uid() or exists (
        select 1 from quiz_participants p where p.session_id = s.id and p.user_id = auth.uid()
      ))
  );
$$;
grant execute on function public.quiz_can_subscribe_realtime(text) to authenticated;

drop policy if exists quiz_members_receive_state on realtime.messages;
create policy quiz_members_receive_state on realtime.messages for select to authenticated using (
  public.quiz_can_subscribe_realtime(realtime.topic())
);
