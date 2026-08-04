-- ─── User Games: public read by id ─────────────────────────────────────────────
-- Every saved analysis is reachable by anyone who has its link (/analysis?id=...),
-- same spirit as Chess.com/Lichess analysis URLs — the id is an unguessable UUID,
-- so this is "share the link" access, not a public/browsable listing (there's no
-- query anywhere that lists other users' games; getUserGames always filters by
-- user_id, and the only way to reach another user's row is knowing its exact id).
-- No per-game opt-in toggle: this is unconditional for every row, additive to the
-- existing "Users can manage own games" owner policy (RLS policies for the same
-- operation are OR'd together, so this only ever *adds* read access — it grants no
-- insert/update/delete access to anyone but the owner).
--
-- Access here is currently gated on nothing but knowing the id. The plan is to gate
-- *viewing* a shared link behind account privileges (e.g. Chess.com prompts sign-in
-- before showing an analysis link opened in a signed-out browser, with paid-tier
-- gating planned beyond that) — that check belongs in the app layer once a
-- privilege/subscription model actually exists, not in RLS today.

create policy "Anyone can view any game by id"
  on public.user_games for select
  using (true);
