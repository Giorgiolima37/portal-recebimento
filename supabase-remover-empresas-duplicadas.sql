-- Remove duplicidades que já existem, mantendo o check-in mais recente.
with registros_ordenados as (
  select
    id,
    row_number() over (
      partition by
        lower(trim(empresa)),
        (criado_em at time zone 'America/Sao_Paulo')::date
      order by criado_em desc, id desc
    ) as posicao
  from public.motoristas
)
delete from public.motoristas
where id in (
  select id
  from registros_ordenados
  where posicao > 1
);

-- Após cada cadastro ou correção, elimina registros antigos da mesma
-- empresa feitos no mesmo dia e conserva apenas o mais recente.
create or replace function public.manter_ultimo_checkin_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.motoristas as registro_antigo
  where lower(trim(registro_antigo.empresa)) = lower(trim(new.empresa))
    and (registro_antigo.criado_em at time zone 'America/Sao_Paulo')::date =
        (new.criado_em at time zone 'America/Sao_Paulo')::date
    and registro_antigo.id <> (
      select registro_atual.id
      from public.motoristas as registro_atual
      where lower(trim(registro_atual.empresa)) = lower(trim(new.empresa))
        and (registro_atual.criado_em at time zone 'America/Sao_Paulo')::date =
            (new.criado_em at time zone 'America/Sao_Paulo')::date
      order by registro_atual.criado_em desc, registro_atual.id desc
      limit 1
    );

  return new;
end;
$$;

drop trigger if exists remover_checkin_duplicado_empresa on public.motoristas;

create trigger remover_checkin_duplicado_empresa
after insert or update of empresa on public.motoristas
for each row
execute function public.manter_ultimo_checkin_empresa();
