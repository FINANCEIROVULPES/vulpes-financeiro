-- Atualiza só alguns campos de um registro (o "update" do sistema), sem sobrescrever o resto.
-- Roda com as permissões de quem chama (security invoker): as regras de sócia continuam valendo.
create or replace function public.mescla_campos(tabela text, registro text, campos jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int;
begin
  if tabela not in ('clients', 'charges', 'jobs', 'expenses', 'expense_entries', 'settlements', 'activity', 'settings') then
    raise exception 'tabela inválida: %', tabela using errcode = '22023';
  end if;
  execute format('update public.%I set data = data || $1 where id = $2', tabela) using campos, registro;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Documento não existe' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.mescla_campos(text, text, jsonb) from public, anon;
grant execute on function public.mescla_campos(text, text, jsonb) to authenticated;
