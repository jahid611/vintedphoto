-- Dripshot — schéma initial.
--
-- Principe : les photos ne quittent jamais l'appareil. La base ne stocke que
-- l'identité, le solde de crédits et des métadonnées de lot. Le solde est
-- exclusivement modifié par des fonctions SECURITY DEFINER : un client ne peut
-- pas s'auto-créditer, même en forgeant ses requêtes.

create extension if not exists "pgcrypto";

-- Crédits offerts à l'inscription (aligné sur FREE_CREDITS côté app).
create or replace function public.dripshot_welcome_credits()
returns integer language sql immutable as $$ select 10 $$;

-- ---------------------------------------------------------------- profils --

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  credits integer not null default 10 check (credits >= 0),
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Pas de policy insert/update/delete : le solde ne bouge que via les RPC.

-- ------------------------------------------------------------ mouvements --

create table if not exists public.credit_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  label text not null,
  delta integer not null,
  created_at timestamptz not null default now()
);

create index if not exists credit_entries_user_created_idx
  on public.credit_entries (user_id, created_at desc);

alter table public.credit_entries enable row level security;

create policy "credit_entries_select_own"
  on public.credit_entries for select
  using (auth.uid() = user_id);

-- --------------------------------------------------------------- achats ---

create table if not exists public.purchases (
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

alter table public.purchases enable row level security;

create policy "purchases_select_own"
  on public.purchases for select
  using (auth.uid() = user_id);

-- ------------------------------------------------------------------ lots --
-- Métadonnées seulement : ni originaux, ni rendus. C'est ce qui garde le coût
-- marginal d'une photo à zéro et la promesse « rien ne quitte ton téléphone ».

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  photo_count integer not null default 0 check (photo_count >= 0),
  exported_count integer not null default 0 check (exported_count >= 0),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists batches_user_created_idx
  on public.batches (user_id, created_at desc);

alter table public.batches enable row level security;

create policy "batches_select_own" on public.batches for select using (auth.uid() = user_id);
create policy "batches_insert_own" on public.batches for insert with check (auth.uid() = user_id);
create policy "batches_update_own" on public.batches for update using (auth.uid() = user_id);
create policy "batches_delete_own" on public.batches for delete using (auth.uid() = user_id);

-- --------------------------------------------------- création du profil ---

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, credits)
  values (new.id, public.dripshot_welcome_credits())
  on conflict (id) do nothing;

  insert into public.credit_entries (user_id, label, delta)
  values (new.id, 'Crédits offerts', public.dripshot_welcome_credits());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------ dépenses ----

-- Débit atomique. L'UPDATE conditionnel sert de verrou : deux exports
-- simultanés ne peuvent pas passer le solde sous zéro.
create or replace function public.spend_credits(amount integer, reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  remaining integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if amount is null or amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  update public.profiles
     set credits = credits - amount
   where id = uid and credits >= amount
  returning credits into remaining;

  if remaining is null then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  insert into public.credit_entries (user_id, label, delta)
  values (uid, coalesce(reason, 'Export'), -amount);

  return remaining;
end;
$$;

revoke all on function public.spend_credits(integer, text) from public;
grant execute on function public.spend_credits(integer, text) to authenticated;

-- ------------------------------------------------------------ recharges ---

-- Réservé au service role : elle n'est appelée que par le webhook Stripe,
-- jamais depuis le navigateur.
create or replace function public.grant_credits(
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
    select 1 from public.purchases
     where stripe_session_id = session_id and status = 'paid'
  ) then
    select credits into remaining from public.profiles where id = target_user;
    return remaining;
  end if;

  update public.profiles
     set credits = credits + amount
   where id = target_user
  returning credits into remaining;

  if remaining is null then
    raise exception 'unknown_profile' using errcode = 'P0002';
  end if;

  insert into public.credit_entries (user_id, label, delta)
  values (target_user, coalesce(reason, 'Recharge'), amount);

  if session_id is not null then
    update public.purchases
       set status = 'paid'
     where stripe_session_id = session_id;
  end if;

  return remaining;
end;
$$;

revoke all on function public.grant_credits(uuid, integer, text, text) from public;
revoke all on function public.grant_credits(uuid, integer, text, text) from anon, authenticated;
