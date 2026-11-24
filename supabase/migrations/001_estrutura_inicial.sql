-- Vulpes Financeiro: estrutura inicial do banco no Supabase
-- Uma tabela por coleção do sistema, com o mesmo identificador usado hoje (ex.: <clienteId>_2026-11).
-- O conteúdo de cada registro fica em "data" (jsonb), exatamente como o app grava hoje,
-- para que as telas e as regras de negócio não precisem mudar.
--
-- Segurança: só as sócias cadastradas na tabela "socias" (Karol e Natasha) leem e gravam.
-- Qualquer outra pessoa, mesmo logada, não vê nada.

-- 1. Quem pode usar o sistema ---------------------------------------------------------
create table if not exists public.socias (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text not null unique,
  criado_em timestamptz not null default now()
);

alter table public.socias enable row level security;

-- Função usada por todas as regras: a pessoa logada é sócia?
create or replace function public.is_socia()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.socias where user_id = auth.uid());
$$;

revoke all on function public.is_socia() from public;
grant execute on function public.is_socia() to authenticated;

-- Cada sócia só enxerga a lista de sócias; ninguém se cadastra sozinha pelo site.
drop policy if exists "socias leem socias" on public.socias;
create policy "socias leem socias" on public.socias
  for select to authenticated using (public.is_socia());

-- 2. Tabelas das coleções ---------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'charges', 'jobs', 'expenses', 'expense_entries', 'settlements', 'activity', 'settings'
  ] loop
    execute format($f$
      create table if not exists public.%1$I (
        id text primary key,
        data jsonb not null default '{}'::jsonb,
        criado_em timestamptz not null default now(),
        atualizado_em timestamptz not null default now(),
        atualizado_por uuid default auth.uid()
      );
      alter table public.%1$I enable row level security;
      alter table public.%1$I replica identity full;

      drop policy if exists "socias leem" on public.%1$I;
      create policy "socias leem" on public.%1$I
        for select to authenticated using (public.is_socia());

      drop policy if exists "socias criam" on public.%1$I;
      create policy "socias criam" on public.%1$I
        for insert to authenticated with check (public.is_socia());

      drop policy if exists "socias alteram" on public.%1$I;
      create policy "socias alteram" on public.%1$I
        for update to authenticated using (public.is_socia()) with check (public.is_socia());

      drop policy if exists "socias apagam" on public.%1$I;
      create policy "socias apagam" on public.%1$I
        for delete to authenticated using (public.is_socia());
    $f$, t);
  end loop;
end $$;

-- 3. Data de atualização automática ---------------------------------------------------
create or replace function public.marca_atualizacao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'charges', 'jobs', 'expenses', 'expense_entries', 'settlements', 'activity', 'settings'
  ] loop
    execute format('drop trigger if exists marca_atualizacao on public.%1$I;', t);
    execute format(
      'create trigger marca_atualizacao before update on public.%1$I for each row execute function public.marca_atualizacao();',
      t
    );
  end loop;
end $$;

-- 4. Atualização ao vivo (Realtime): o que uma sócia muda aparece para a outra sem recarregar
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'charges', 'jobs', 'expenses', 'expense_entries', 'settlements', 'activity', 'settings'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;

-- 5. Cadastro das sócias (rodar DEPOIS de criar os usuários em Authentication > Users)
-- insert into public.socias (user_id, nome, email)
-- select id, 'Karol', email from auth.users where email = 'EMAIL_DA_KAROL'
-- union all
-- select id, 'Natasha', email from auth.users where email = 'EMAIL_DA_NATASHA';
