-- Reproduit le strict minimum de l'environnement Supabase pour rejouer le
-- schéma sur un Postgres nu : le schéma auth, auth.uid(), et les trois rôles.
-- Sert uniquement aux tests locaux, jamais appliqué sur le projet hébergé.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

-- Chez Supabase, auth.uid() lit le claim `sub` du JWT. En local on le simule
-- avec un paramètre de session, réglé par les tests.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;
