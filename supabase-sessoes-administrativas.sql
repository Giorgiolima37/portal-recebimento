-- BLOQUEIO DE LOGIN SIMULTANEO NO PAINEL ADMINISTRATIVO
-- Execute todo este arquivo no Supabase: SQL Editor > New query > Run.

create table if not exists public.sessoes_administrativas (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  sessao_id uuid not null,
  atualizado_em timestamptz not null default now()
);

alter table public.sessoes_administrativas enable row level security;
revoke all on public.sessoes_administrativas from anon, authenticated;

create or replace function public.listar_usuarios_em_uso()
returns table (email text)
language sql
security definer
set search_path = public, auth
as $$
  select u.email::text
  from public.sessoes_administrativas s
  join auth.users u on u.id = s.usuario_id
  where s.atualizado_em > now() - interval '35 seconds';
$$;

create or replace function public.ocupar_sessao_administrativa(p_sessao_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_sessao public.sessoes_administrativas%rowtype;
begin
  if v_usuario_id is null then return false; end if;

  select * into v_sessao
  from public.sessoes_administrativas
  where usuario_id = v_usuario_id
  for update;

  if found
     and v_sessao.sessao_id <> p_sessao_id
     and v_sessao.atualizado_em > now() - interval '35 seconds' then
    return false;
  end if;

  insert into public.sessoes_administrativas (usuario_id, sessao_id, atualizado_em)
  values (v_usuario_id, p_sessao_id, now())
  on conflict (usuario_id) do update
  set sessao_id = excluded.sessao_id,
      atualizado_em = now();
  return true;
end;
$$;

create or replace function public.manter_sessao_administrativa(p_sessao_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sessoes_administrativas
  set atualizado_em = now()
  where usuario_id = auth.uid() and sessao_id = p_sessao_id;
  return found;
end;
$$;

create or replace function public.liberar_sessao_administrativa(p_sessao_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.sessoes_administrativas
  where usuario_id = auth.uid() and sessao_id = p_sessao_id;
$$;

grant execute on function public.listar_usuarios_em_uso() to anon, authenticated;
grant execute on function public.ocupar_sessao_administrativa(uuid) to authenticated;
grant execute on function public.manter_sessao_administrativa(uuid) to authenticated;
grant execute on function public.liberar_sessao_administrativa(uuid) to authenticated;

