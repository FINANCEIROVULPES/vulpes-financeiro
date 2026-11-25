-- Integração com o Asaas: configuração interna e extensão para chamadas HTTP a partir do banco.
create extension if not exists http with schema extensions;

-- Guarda a senha interna que autoriza chamadas à função "asaas".
-- RLS ligado e nenhuma regra: ninguém lê pela API; só a própria função (service role) e o banco.
create table if not exists public.integracao_config (
  chave text primary key,
  valor text not null,
  criado_em timestamptz not null default now()
);
alter table public.integracao_config enable row level security;
revoke all on public.integracao_config from public, anon, authenticated;

insert into public.integracao_config (chave, valor)
values ('asaas_token_interno', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (chave) do nothing;
