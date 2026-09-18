-- Dripshot — schéma initial, dans son propre schéma `dripshot`.
--
-- Ce projet Supabase héberge déjà une autre application. Cette migration ne
-- touche donc RIEN en dehors du schéma `dripshot` : ni `public`, ni `auth`,
-- ni extension. Pas de trigger sur `auth.users` non plus — le compte est créé
-- à la première utilisation (`ensure_account`) plutôt qu'à l'inscription.
-- Un trigger supplémentaire sur `auth.users` marcherait, mais une erreur dans
-- mon code casserait l'inscription de l'app voisine.
--
-- Tout se défait d'un `drop schema dripshot cascade`.
--
-- Principe : les photos ne quittent jamais l'appareil. La base ne stocke que
-- l'identité, le solde de crédits et des métadonnées de lot. Le solde est
-- exclusivement modifié par des fonctions SECURITY DEFINER : un client ne peut
-- pas s'auto-créditer, même en forgeant ses requêtes.
--
-- Le fichier est rejouable : chaque objet est créé « if not exists » et chaque
-- policy est déposée avant d'être recréée.
--
-- Après application : Data API → Exposed schemas → ajouter `dripshot`.
-- Sans ça, PostgREST ne sert aucune de ces tables.

create schema if not exists dripshot;

-- Crédits offerts au premier usage (aligné sur FREE_CREDITS côté app).
create or replace function dripshot.welcome_credits()
returns integer language sql immutable as $$ select 10 $$;

-- --------------------------------------------------------------- comptes --
-- Nommé `accounts` et pas `profiles` : `public.profiles` existe déjà dans ce
-- projet pour l'autre application, autant qu'aucune relecture ne confonde.

create table if not exists dripshot.accounts (
  id uuid primary key references auth.users on delete cascade,
  credits integer not null default 10 check (credits >= 0),
  created_at timestamptz not null default now()
);

alter table dripshot.accounts enable row level security;

-- `(select auth.uid())` et pas `auth.uid()` : sans le sous-select, Postgres
-- rappelle la fonction pour chaque ligne examinée.
drop policy if exists "accounts_select_own" on dripshot.accounts;
create policy "accounts_select_own"
  on dripshot.accounts for select
  to authenticated
  using ((select auth.uid()) = id);

-- Pas de policy insert/update/delete : le solde ne bouge que via les RPC.

-- ------------------------------------------------------------ mouvements --

create table if not exists dripshot.credit_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  label text not null,
  delta integer not null,
  created_at timestamptz not null default now()
);

-- Sert l'historique (trié par date) et la clé étrangère (colonne de tête).
create index if not exists credit_entries_user_created_idx
  on dripshot.credit_entries (user_id, created_at desc);

alter table dripshot.credit_entries enable row level security;

drop policy if exists "credit_entries_select_own" on dripshot.credit_entries;
create policy "credit_entries_select_own"
  on dripshot.credit_entries for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- --------------------------------------------------------------- achats ---

create table if not exists dripshot.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  pack_id text not null,
  credits integer not null check (credits > 0),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'eur',
  stripe_session_id text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded')),
  created_at timestamptz not null default now()
);

-- Postgres n'indexe pas les clés étrangères tout seul : sans ça, supprimer un
-- compte scanne toute la table.
create index if not exists purchases_user_created_idx
  on dripshot.purchases (user_id, created_at desc);

alter table dripshot.purchases enable row level security;

drop policy if exists "purchases_select_own" on dripshot.purchases;
create policy "purchases_select_own"
  on dripshot.purchases for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------ lots --
-- Métadonnées seulement : ni originaux, ni rendus. C'est ce qui garde le coût
-- marginal d'une photo à zéro et la promesse « rien ne quitte ton téléphone ».

create table if not exists dripshot.batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  photo_count integer not null default 0 check (photo_count >= 0),
  exported_count integer not null default 0 check (exported_count >= 0),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists batches_user_created_idx
  on dripshot.batches (user_id, created_at desc);

alter table dripshot.batches enable row level security;

drop policy if exists "batches_select_own" on dripshot.batches;
create policy "batches_select_own"
  on dripshot.batches for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "batches_insert_own" on dripshot.batches;
create policy "batches_insert_own"
  on dripshot.batches for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- `with check` autant que `using` : sans lui, un client peut modifier une de
-- ses lignes pour la réattribuer à quelqu'un d'autre.
drop policy if exists "batches_update_own" on dripshot.batches;
create policy "batches_update_own"
  on dripshot.batches for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "batches_delete_own" on dripshot.batches;
create policy "batches_delete_own"
  on dripshot.batches for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ----------------------------------------------------- ouverture de compte --

-- Interne : crée le compte s'il manque et renvoie le solde. Jamais exposée,
-- puisqu'elle accepte un identifiant arbitraire en argument.
create or replace function dripshot.ensure_account_for(target_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare solde integer;
begin
  insert into dripshot.accounts (id, credits)
  values (target_user, dripshot.welcome_credits())
  on conflict (id) do nothing;

  -- FOUND est faux quand le compte existait déjà : l'historique n'est écrit
  -- qu'à la création, sinon chaque passage ajouterait une ligne « offerts ».
  if found then
    insert into dripshot.credit_entries (user_id, label, delta)
    values (target_user, 'Crédits offerts', dripshot.welcome_credits());
  end if;

  select credits into solde from dripshot.accounts where id = target_user;
  return solde;
end;
$$;

revoke all on function dripshot.ensure_account_for(uuid) from public;

-- Publique : chaque appelant n'ouvre que son propre compte.
create or replace function dripshot.ensure_account()
returns integer language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return dripshot.ensure_account_for(uid);
end;
$$;

revoke all on function dripshot.ensure_account() from public;
grant execute on function dripshot.ensure_account() to authenticated;

-- ------------------------------------------------------------ dépenses ----

-- Débit atomique. L'UPDATE conditionnel sert de verrou : deux exports
-- simultanés ne peuvent pas passer le solde sous zéro.
create or replace function dripshot.spend_credits(amount integer, reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  remaining integer;
begin
  -- Contrôle d'identité explicite : la fonction contourne la RLS, elle ne doit
  -- donc jamais faire confiance à son appelant sur ce point.
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if amount is null or amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  -- Un client qui n'a jamais appelé ensure_account reste servi.
  perform dripshot.ensure_account_for(uid);

  update dripshot.accounts
     set credits = credits - amount
   where id = uid and credits >= amount
  returning credits into remaining;

  if remaining is null then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  insert into dripshot.credit_entries (user_id, label, delta)
  values (uid, coalesce(reason, 'Export'), -amount);

  return remaining;
end;
$$;

revoke all on function dripshot.spend_credits(integer, text) from public;
grant execute on function dripshot.spend_credits(integer, text) to authenticated;

-- ------------------------------------------------------------ recharges ---

-- Réservée au service role : elle n'est appelée que par le webhook Stripe,
-- jamais depuis le navigateur.
create or replace function dripshot.grant_credits(
  target_user uuid,
  amount integer,
  reason text,
  session_id text default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  remaining integer;
begin
  if amount is null or amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  -- Idempotence : un webhook Stripe rejoué ne crédite pas deux fois.
  if session_id is not null and exists (
    select 1 from dripshot.purchases
     where stripe_session_id = session_id and status = 'paid'
  ) then
    select credits into remaining from dripshot.accounts where id = target_user;
    return remaining;
  end if;

  perform dripshot.ensure_account_for(target_user);

  update dripshot.accounts
     set credits = credits + amount
   where id = target_user
  returning credits into remaining;

  if remaining is null then
    raise exception 'unknown_account' using errcode = 'P0002';
  end if;

  insert into dripshot.credit_entries (user_id, label, delta)
  values (target_user, coalesce(reason, 'Recharge'), amount);

  if session_id is not null then
    update dripshot.purchases
       set status = 'paid'
     where stripe_session_id = session_id;
  end if;

  return remaining;
end;
$$;

revoke all on function dripshot.grant_credits(uuid, integer, text, text) from public;
-- service_role contourne la RLS mais pas les privilèges : sans ce GRANT
-- explicite, le webhook se prend un « permission denied for function ».
grant execute on function dripshot.grant_credits(uuid, integer, text, text) to service_role;

-- ------------------------------------------------------------ privilèges --
--
-- La RLS dit quelles LIGNES sont visibles ; encore faut-il que le rôle ait le
-- droit d'ouvrir le SCHÉMA et la TABLE. Sans ces GRANT, le client reçoit
-- « permission denied for schema dripshot ».
--
-- Rien pour `anon` au-delà de l'accès au schéma : même en connexion anonyme,
-- un utilisateur Supabase porte le rôle `authenticated`. Rien en écriture sur
-- accounts, credit_entries et purchases : elles ne se remplissent que par les
-- fonctions ci-dessus.

grant usage on schema dripshot to anon, authenticated, service_role;

-- Le webhook passe par grant_credits, qui est SECURITY DEFINER et s'exécute
-- donc sous le propriétaire — aucun privilège requis. Mais la route de
-- paiement, elle, insère l'intention d'achat en direct avec la clé
-- service_role : sans ce GRANT, créer une session Stripe échoue.
grant select, insert on dripshot.purchases to service_role;

grant select on dripshot.accounts to authenticated;
grant select on dripshot.credit_entries to authenticated;
grant select on dripshot.purchases to authenticated;
grant select, insert, update, delete on dripshot.batches to authenticated;
