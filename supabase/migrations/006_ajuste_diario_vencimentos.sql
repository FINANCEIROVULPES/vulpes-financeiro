-- Verificação diária: cobranças pendentes no Asaas que caem em sábado, domingo ou feriado
-- (ou fora da regra do cliente, como o 5º dia útil) passam para a data certa.
-- Roda todo dia às 07:17 (Brasília) = 10:17 UTC. Resultado da última execução em
-- public.integracao_config, chave 'asaas_ultimo_ajuste'.
create extension if not exists pg_cron;

create or replace function privado.ajustar_vencimentos_asaas()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform extensions.http((
    'POST',
    'https://xrhrzpikyxvgjzpiryku.supabase.co/functions/v1/asaas',
    array[extensions.http_header('x-vulpes-token',
      (select valor from public.integracao_config where chave = 'asaas_token_interno'))],
    'application/json',
    '{"acao":"ajustar_vencimentos","dias":60}'
  )::extensions.http_request);
end;
$$;

revoke all on function privado.ajustar_vencimentos_asaas() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'ajustar-vencimentos-asaas';
select cron.schedule('ajustar-vencimentos-asaas', '17 10 * * *', 'select privado.ajustar_vencimentos_asaas()');
