-- Árvore da Família — schema do projeto Supabase PRÓPRIO (independente de qualquer outro projeto).
-- Correr uma vez no SQL Editor do projeto. Depois, à parte: inserir o gestor (ver fim do ficheiro).
--
-- Regras:
--   * Só entra quem está em `membros` (email Google). Cada membro tem uma pessoa-âncora (pessoa_id na árvore).
--   * Só o gestor convida, aprova, muda âncoras e retira acessos (RPCs abaixo, que confirmam is_gestor()).
--   * Os dados da árvore estão em `arvore_export`, em duas camadas: «familia» (membros) e «gestor» (só gestor).
--   * As respostas do gestor à fila «À espera do Tiago» ficam em `respostas`; o Arquiteto lê-as com a chave
--     service_role (tools/respostas.py), que ignora a RLS.
--   * anon não tem acesso a nada.

create extension if not exists pgcrypto;

-- ---------- membros (quem tem acesso) e funções de acesso
create table if not exists public.membros (
  email      text primary key check (email = lower(email)),
  nome       text,
  papel      text not null default 'membro' check (papel in ('membro', 'gestor')),
  pessoa_id  text not null,                       -- âncora: id da pessoa na árvore (ex.: '1000003')
  added_at   timestamptz not null default now(),
  added_by   text
);
alter table public.membros enable row level security;

create or replace function public.meu_email() returns text language sql stable as
$$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;
create or replace function public.is_membro() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.membros where email = public.meu_email()) $$;
create or replace function public.is_gestor() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.membros where email = public.meu_email() and papel = 'gestor') $$;
create or replace function public.meu_acesso() returns json language sql stable security definer set search_path = public as
$$ select json_build_object('email', email, 'nome', nome, 'papel', papel, 'pessoa_id', pessoa_id) from public.membros where email = public.meu_email() $$;

-- ---------- convites (criados pelo gestor, ancorados numa pessoa; 30 dias; uma utilização)
create table if not exists public.convites (
  token        text primary key default translate(encode(gen_random_bytes(18), 'base64'), '+/=', '-_'),
  pessoa_id    text not null,
  pessoa_nome  text,
  nota         text,
  criado_por   text not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 days',
  usado_por    text,
  usado_em     timestamptz
);
alter table public.convites enable row level security;

-- ---------- pedidos de acesso (quem entrou com Google sem estar em membros)
create table if not exists public.pedidos (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  nome         text,
  user_id      uuid,
  convite      text references public.convites(token) on delete set null,
  pessoa_id    text,                               -- âncora proposta pelo convite (o gestor pode mudar ao aprovar)
  pessoa_nome  text,
  estado       text not null default 'pendente' check (estado in ('pendente', 'aprovado', 'bloqueado')),
  created_at   timestamptz not null default now(),
  notified_at  timestamptz,
  decided_at   timestamptz,
  decided_by   text
);
alter table public.pedidos enable row level security;

-- ---------- dados da árvore (exportação; escrita só pela chave service_role, em tools/exportar.py)
create table if not exists public.arvore_export (
  camada         text primary key check (camada in ('familia', 'gestor')),
  versao         text not null,
  gerado         text,
  atualizado_em  timestamptz not null default now(),
  dados          jsonb not null
);
alter table public.arvore_export enable row level security;
drop policy if exists "arvore ler" on public.arvore_export;
create policy "arvore ler" on public.arvore_export for select to authenticated
  using ((camada = 'familia' and (select public.is_membro())) or (camada = 'gestor' and (select public.is_gestor())));

-- ---------- respostas do gestor à fila de decisões (equivalente à coleção «respostas» do artifact)
create table if not exists public.respostas (
  item_id       text primary key,
  decisao       text not null check (decisao in ('aprovado', 'rejeitado', 'adiado')),
  nota          text not null default '',
  ts            timestamptz not null default now(),
  registada     boolean not null default false,       -- o Arquiteto marca true depois de correr decide.py
  registada_em  timestamptz,
  quem          text,
  ids           jsonb,
  texto         text,
  categoria     text
);
alter table public.respostas enable row level security;
drop policy if exists "respostas gestor" on public.respostas;
create policy "respostas gestor" on public.respostas for all to authenticated
  using ((select public.is_gestor())) with check ((select public.is_gestor()));
-- carimbo: quem e quando; uma resposta mudada pelo gestor volta a «por registar»
create or replace function public.respostas_carimbo() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.meu_email() <> '' then          -- pedido do browser (gestor); a service_role (Arquiteto) não tem email
    new.quem := public.meu_email();
    new.ts := now();
    if tg_op = 'INSERT' or new.decisao is distinct from old.decisao or new.nota is distinct from old.nota then
      new.registada := false; new.registada_em := null;
    else
      new.registada := old.registada; new.registada_em := old.registada_em;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists respostas_carimbo on public.respostas;
create trigger respostas_carimbo before insert or update on public.respostas for each row execute function public.respostas_carimbo();

-- ---------- permissões mínimas
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
grant select on public.arvore_export to authenticated;
grant select, insert, update on public.respostas to authenticated;
-- membros, convites e pedidos: só através das funções abaixo

-- ---------- RPCs
-- pedir acesso (quem ainda não é membro), com o convite se houver
create or replace function public.pedir_acesso(p_convite text default null) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_email text := public.meu_email();
  v_nome text := nullif(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name'), '');
  v_conv public.convites;
  v_ped public.pedidos;
  v_novo_conv boolean := false;
begin
  if v_email = '' then raise exception 'sem sessão'; end if;
  if public.is_membro() then return json_build_object('estado', 'membro'); end if;
  if p_convite is not null then
    select * into v_conv from public.convites where token = p_convite and expires_at > now() and (usado_por is null or usado_por = v_email);
    if found then
      update public.convites set usado_por = v_email, usado_em = coalesce(usado_em, now()) where token = v_conv.token;
    end if;
  end if;
  select * into v_ped from public.pedidos where email = v_email;
  if found and v_ped.estado = 'bloqueado' then return json_build_object('estado', 'bloqueado'); end if;
  if not found then
    insert into public.pedidos (email, nome, user_id, convite, pessoa_id, pessoa_nome)
      values (v_email, v_nome, auth.uid(), v_conv.token, v_conv.pessoa_id, v_conv.pessoa_nome) returning * into v_ped;
  else
    v_novo_conv := v_conv.token is not null and v_ped.convite is distinct from v_conv.token;
    update public.pedidos set
        nome = coalesce(v_nome, nome), user_id = coalesce(auth.uid(), user_id),
        convite = coalesce(v_conv.token, convite), pessoa_id = coalesce(v_conv.pessoa_id, pessoa_id), pessoa_nome = coalesce(v_conv.pessoa_nome, pessoa_nome),
        estado = 'pendente', decided_at = case when estado = 'pendente' then decided_at end,
        notified_at = case when v_novo_conv or estado <> 'pendente' then null else notified_at end
      where id = v_ped.id returning * into v_ped;
  end if;
  return json_build_object('estado', 'pendente', 'convite', v_ped.convite is not null, 'notificar', v_ped.notified_at is null);
end $$;

create or replace function public.exigir_gestor() returns void language plpgsql stable security definer set search_path = public as
$$ begin if not public.is_gestor() then raise exception 'só o gestor'; end if; end $$;

create or replace function public.gestao_listar() returns json language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_gestor();
  return json_build_object(
    'membros',  coalesce((select json_agg(m order by m.papel desc, m.nome) from public.membros m), '[]'),
    'pedidos',  coalesce((select json_agg(p order by p.created_at desc) from public.pedidos p where p.estado = 'pendente'), '[]'),
    'convites', coalesce((select json_agg(c order by c.created_at desc) from public.convites c where c.expires_at > now() - interval '30 days'), '[]'));
end $$;

create or replace function public.criar_convite(p_pessoa text, p_nome text default null, p_nota text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  perform public.exigir_gestor();
  if coalesce(p_pessoa, '') = '' then raise exception 'falta a pessoa'; end if;
  insert into public.convites (pessoa_id, pessoa_nome, nota, criado_por) values (p_pessoa, p_nome, p_nota, public.meu_email()) returning token into v;
  return v;
end $$;

create or replace function public.apagar_convite(p_token text) returns void language plpgsql security definer set search_path = public as
$$ begin perform public.exigir_gestor(); delete from public.convites where token = p_token; end $$;

create or replace function public.aprovar_pedido(p_id uuid, p_pessoa text) returns void language plpgsql security definer set search_path = public as $$
declare v public.pedidos;
begin
  perform public.exigir_gestor();
  if coalesce(p_pessoa, '') = '' then raise exception 'falta a pessoa-âncora'; end if;
  select * into v from public.pedidos where id = p_id and estado = 'pendente';
  if not found then raise exception 'pedido inexistente ou já decidido'; end if;
  insert into public.membros (email, nome, papel, pessoa_id, added_by) values (v.email, v.nome, 'membro', p_pessoa, public.meu_email())
    on conflict (email) do update set pessoa_id = excluded.pessoa_id;
  update public.pedidos set estado = 'aprovado', decided_at = now(), decided_by = public.meu_email() where id = p_id;
end $$;

create or replace function public.bloquear_pedido(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_gestor();
  update public.pedidos set estado = 'bloqueado', decided_at = now(), decided_by = public.meu_email() where id = p_id;
end $$;

create or replace function public.mudar_ancora(p_email text, p_pessoa text) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_gestor();
  if coalesce(p_pessoa, '') = '' then raise exception 'falta a pessoa-âncora'; end if;
  update public.membros set pessoa_id = p_pessoa where email = lower(p_email);
end $$;

create or replace function public.remover_membro(p_email text) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_gestor();
  if lower(p_email) = public.meu_email() then raise exception 'não pode retirar o próprio acesso'; end if;
  delete from public.membros where email = lower(p_email) and papel <> 'gestor';
  update public.pedidos set estado = 'bloqueado', decided_at = now(), decided_by = public.meu_email() where email = lower(p_email);
end $$;

do $$ declare f text; begin
  foreach f in array array['meu_acesso()', 'is_membro()', 'is_gestor()', 'pedir_acesso(text)', 'gestao_listar()', 'criar_convite(text,text,text)', 'apagar_convite(text)',
                           'aprovar_pedido(uuid,text)', 'bloquear_pedido(uuid)', 'mudar_ancora(text,text)', 'remover_membro(text)', 'exigir_gestor()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- imagens: bucket privado «arvore» (img/…); só membros pedem URLs assinados
insert into storage.buckets (id, name, public) values ('arvore', 'arvore', false) on conflict (id) do nothing;
drop policy if exists "arvore imagens ler" on storage.objects;
create policy "arvore imagens ler" on storage.objects for select to authenticated
  using (bucket_id = 'arvore' and (select public.is_membro()));

-- ---------- limpeza: convites expirados há mais de 60 dias (se a extensão pg_cron estiver ativa)
-- select cron.schedule('arvore-convites-limpeza', '50 4 * * *', $$ delete from public.convites where expires_at < now() - interval '60 days' and usado_por is null $$);

-- ---------- gestor (correr à parte, com o email Google do Tiago; não fica no repositório):
-- insert into public.membros (email, nome, papel, pessoa_id, added_by) values ('<email-google-do-tiago>', 'Tiago', 'gestor', '1000003', 'instalação');
select 'ok' as arvore_schema;
