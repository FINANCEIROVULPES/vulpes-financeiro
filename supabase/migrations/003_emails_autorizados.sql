-- E-mails autorizados: quando uma dessas pessoas cria a conta (convite ou cadastro),
-- ela vira sócia automaticamente. Qualquer outro e-mail entra sem acesso a nada.
create table if not exists privado.emails_autorizados (
  email text primary key,
  nome text not null
);
revoke all on privado.emails_autorizados from public, anon, authenticated;

insert into privado.emails_autorizados (email, nome) values
  ('servidorvulpes2025@gmail.com', 'Karol'),
  ('comunicacaovulpes@gmail.com', 'Natasha')
on conflict (email) do update set nome = excluded.nome;

create or replace function privado.vincula_socia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n text;
begin
  select nome into n from privado.emails_autorizados where email = lower(new.email);
  if n is not null then
    insert into public.socias (user_id, nome, email) values (new.id, n, lower(new.email))
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function privado.vincula_socia() from public, anon, authenticated;

drop trigger if exists vincula_socia on auth.users;
create trigger vincula_socia after insert on auth.users
  for each row execute function privado.vincula_socia();

-- Caso alguma das duas já tenha conta criada antes deste roteiro
insert into public.socias (user_id, nome, email)
select u.id, a.nome, lower(u.email)
from auth.users u join privado.emails_autorizados a on a.email = lower(u.email)
on conflict (user_id) do nothing;
