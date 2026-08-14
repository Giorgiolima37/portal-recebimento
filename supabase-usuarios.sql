-- USUÁRIOS DO PAINEL ADMINISTRATIVO
-- Execute este arquivo no Supabase: SQL Editor > New query > Run.
-- As senhas ficam protegidas no Supabase Authentication (auth.users).
-- Nunca crie uma coluna para armazenar senhas em texto.

create table if not exists public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  usuario text not null unique check (usuario ~ '^[A-Za-zÀ-ÖØ-öø-ÿ0-9]+( [A-Za-zÀ-ÖØ-öø-ÿ0-9]+)*$'),
  nome text not null,
  email text not null unique,
  perfil text not null default 'administrador'
    check (perfil in ('administrador', 'operador')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Migração para quando a tabela já tiver sido criada anteriormente.
alter table public.usuarios add column if not exists usuario text;
update public.usuarios
set usuario = regexp_replace(split_part(email, '@', 1), '[^A-Za-z0-9]', '', 'g') || substr(id::text, 1, 4)
where usuario is null or usuario = '';
alter table public.usuarios alter column usuario set not null;
create unique index if not exists usuarios_usuario_unico on public.usuarios (lower(usuario));
do $$
begin
  alter table public.usuarios drop constraint if exists usuarios_usuario_formato;
  if not exists (
    select 1 from pg_constraint where conname = 'usuarios_usuario_formato'
  ) then
    alter table public.usuarios
      add constraint usuarios_usuario_formato
      check (usuario ~ '^[A-Za-zÀ-ÖØ-öø-ÿ0-9]+( [A-Za-zÀ-ÖØ-öø-ÿ0-9]+)*$');
  end if;
end;
$$;

alter table public.usuarios enable row level security;

-- Qualquer usuário autenticado no painel pode ver a lista de usuários.
drop policy if exists "usuarios autenticados podem visualizar" on public.usuarios;
create policy "usuarios autenticados podem visualizar"
on public.usuarios
for select
to authenticated
using (true);

-- Cada usuário pode alterar somente o próprio nome.
drop policy if exists "usuario pode atualizar o proprio cadastro" on public.usuarios;
create policy "usuario pode atualizar o proprio cadastro"
on public.usuarios
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Cria automaticamente o cadastro público quando uma conta é criada no Auth.
create or replace function public.criar_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, usuario, nome, email)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'usuario', ''),
      regexp_replace(split_part(new.email, '@', 1), '[^A-Za-z0-9]', '', 'g')
    ),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nome', ''),
      initcap(split_part(new.email, '@', 1))
    ),
    new.email
  )
  on conflict (id) do update
  set email = excluded.email,
      atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists criar_perfil_apos_cadastro on auth.users;
create trigger criar_perfil_apos_cadastro
after insert or update of email on auth.users
for each row execute function public.criar_perfil_usuario();

-- Copia também as contas que já existiam antes deste SQL.
insert into public.usuarios (id, usuario, nome, email)
select
  id,
  coalesce(
    nullif(raw_user_meta_data ->> 'usuario', ''),
    regexp_replace(split_part(email, '@', 1), '[^A-Za-z0-9]', '', 'g')
  ),
  coalesce(
    nullif(raw_user_meta_data ->> 'nome', ''),
    initcap(split_part(email, '@', 1))
  ),
  email
from auth.users
where email is not null
on conflict (id) do update
set email = excluded.email,
    atualizado_em = now();

-- Mantém a data de alteração atualizada.
create or replace function public.atualizar_data_usuario()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists atualizar_data_usuario on public.usuarios;
create trigger atualizar_data_usuario
before update on public.usuarios
for each row execute function public.atualizar_data_usuario();
