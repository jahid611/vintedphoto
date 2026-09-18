-- Tests fonctionnels du schéma, à jouer sur une base jetable (voir
-- scripts/db-test.sh). Ils vérifient ce qu'une relecture ne montre pas :
-- l'isolation réelle entre deux comptes, le comportement des fonctions sous
-- contrainte, et les privilèges effectifs de chaque rôle.

create or replace function public.t_assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok then raise notice 'ok     %', label;
  else raise exception 'ECHEC  %', label; end if;
end;
$$;

-- Deux comptes de test.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local');

-- 1. Le trigger d'inscription crée le profil et la ligne d'historique.
do $$
declare solde integer; lignes integer;
begin
  select credits into solde from public.profiles
   where id = '11111111-1111-1111-1111-111111111111';
  select count(*) into lignes from public.credit_entries
   where user_id = '11111111-1111-1111-1111-111111111111';
  perform public.t_assert(solde = 10, 'inscription : 10 crédits offerts');
  perform public.t_assert(lignes = 1, 'inscription : historique initialisé');
end;
$$;

-- 2. Débit nominal, puis solde insuffisant.
do $$
declare reste integer; leve boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  reste := public.spend_credits(3, 'export de 3 photos');
  perform public.t_assert(reste = 7, 'débit : 10 - 3 = 7');

  begin
    perform public.spend_credits(100, 'export impossible');
  exception when others then
    leve := (sqlerrm = 'insufficient_credits');
  end;
  perform public.t_assert(leve, 'débit : solde insuffisant refusé');
end;
$$;

-- 3. Sans session, aucun débit possible.
do $$
declare leve boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.spend_credits(1, 'anonyme');
  exception when others then
    leve := (sqlerrm = 'not_authenticated');
  end;
  perform public.t_assert(leve, 'débit : appel non authentifié refusé');
end;
$$;

-- 4. Isolation RLS : chacun ne voit que ses lignes.
do $$
declare vus integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  select count(*) into vus from public.profiles;
  perform public.t_assert(vus = 1, 'RLS : un seul profil visible');

  select count(*) into vus from public.credit_entries
   where user_id = '22222222-2222-2222-2222-222222222222';
  perform public.t_assert(vus = 0, 'RLS : historique du voisin invisible');
end;
$$;

-- 5. Un lot ne peut pas être réattribué à quelqu'un d'autre (`with check`).
do $$
declare refuse boolean := false; vus integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  insert into public.batches (user_id, name, photo_count)
  values ('11111111-1111-1111-1111-111111111111', 'lot de A', 4);

  select count(*) into vus from public.batches;
  perform public.t_assert(vus = 1, 'lots : insertion pour soi acceptée');

  begin
    update public.batches
       set user_id = '22222222-2222-2222-2222-222222222222';
  exception when others then
    refuse := true;
  end;
  perform public.t_assert(refuse, 'lots : réattribution à autrui refusée');
end;
$$;

-- 6. Un lot inséré au nom d'un autre est refusé.
do $$
declare refuse boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  begin
    insert into public.batches (user_id, name)
    values ('22222222-2222-2222-2222-222222222222', 'lot volé');
  exception when others then
    refuse := true;
  end;
  perform public.t_assert(refuse, 'lots : insertion au nom d''autrui refusée');
end;
$$;

-- 7. Un client ne peut pas se créditer lui-même.
do $$
declare refuse boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  begin
    perform public.grant_credits('11111111-1111-1111-1111-111111111111', 500, 'auto-cadeau', null);
  exception when insufficient_privilege then
    refuse := true;
  end;
  perform public.t_assert(refuse, 'recharge : interdite au client');
end;
$$;

-- 8. Le webhook, lui, crédite — et une seule fois par session Stripe.
do $$
declare apres integer; rejoue integer;
begin
  insert into public.purchases (user_id, pack_id, credits, amount_cents, stripe_session_id, status)
  values ('11111111-1111-1111-1111-111111111111', 'pro', 500, 1499, 'cs_test_1', 'pending');

  set local role service_role;
  apres := public.grant_credits('11111111-1111-1111-1111-111111111111', 500, 'Pack pro', 'cs_test_1');
  perform public.t_assert(apres = 507, 'recharge : 7 + 500 = 507');

  rejoue := public.grant_credits('11111111-1111-1111-1111-111111111111', 500, 'Pack pro', 'cs_test_1');
  perform public.t_assert(rejoue = 507, 'recharge : webhook rejoué sans double crédit');
end;
$$;

-- 9. L'achat est bien passé en payé.
do $$
declare etat text;
begin
  select status into etat from public.purchases where stripe_session_id = 'cs_test_1';
  perform public.t_assert(etat = 'paid', 'achat : statut passé à paid');
end;
$$;

-- 10. Aucune clé étrangère sans index (cascade de suppression lente).
do $$
declare manquantes integer;
begin
  select count(*) into manquantes
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.contype = 'f'
     and c.connamespace = 'public'::regnamespace
     and not exists (
       select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indkey[0] = a.attnum
     );
  perform public.t_assert(manquantes = 0, 'schéma : toutes les FK sont indexées');
end;
$$;

-- 11. Toute table exposée a bien la RLS activée.
do $$
declare sans_rls integer;
begin
  select count(*) into sans_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  perform public.t_assert(sans_rls = 0, 'schéma : RLS active sur toutes les tables');
end;
$$;

-- 12. Aucune policy ne rappelle auth.uid() ligne par ligne.
do $$
declare non_optimisees integer;
begin
  select count(*) into non_optimisees
    from pg_policies
   where schemaname = 'public'
     and (coalesce(qual, '') || coalesce(with_check, '')) like '%auth.uid()%'
     and (coalesce(qual, '') || coalesce(with_check, '')) not like '%( SELECT auth.uid()%';
  perform public.t_assert(non_optimisees = 0, 'RLS : auth.uid() toujours dans un sous-select');
end;
$$;
