-- Move a verificação "é sócia?" para um schema que não é exposto pela API do Supabase.
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;

create or replace function privado.is_socia()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.socias where user_id = auth.uid());
$$;

revoke all on function privado.is_socia() from public, anon;
grant execute on function privado.is_socia() to authenticated;

drop policy if exists "socias leem socias" on public.socias;
create policy "socias leem socias" on public.socias
  for select to authenticated using (privado.is_socia());

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'charges', 'jobs', 'expenses', 'expense_entries', 'settlements', 'activity', 'settings'
  ] loop
    execute format($f$
      drop policy if exists "socias leem" on public.%1$I;
      create policy "socias leem" on public.%1$I
        for select to authenticated using (privado.is_socia());
      drop policy if exists "socias criam" on public.%1$I;
      create policy "socias criam" on public.%1$I
        for insert to authenticated with check (privado.is_socia());
      drop policy if exists "socias alteram" on public.%1$I;
      create policy "socias alteram" on public.%1$I
        for update to authenticated using (privado.is_socia()) with check (privado.is_socia());
      drop policy if exists "socias apagam" on public.%1$I;
      create policy "socias apagam" on public.%1$I
        for delete to authenticated using (privado.is_socia());
    $f$, t);
  end loop;
end $$;

drop function if exists public.is_socia();
