create index if not exists quiz_global_scores_source_session_id_idx
  on public.quiz_global_scores (source_session_id);

-- Reemplazado por private.quiz_can_subscribe_realtime en la política actual.
revoke all on function public.quiz_can_subscribe_realtime(text) from public, anon, authenticated;
