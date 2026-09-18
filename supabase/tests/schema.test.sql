-- Tests fonctionnels du schéma, à jouer sur une base jetable (voir
-- scripts/db-test.sh). Ils vérifient ce qu'une relecture ne montre pas :
-- l'isolation réelle entre deux comptes, le comportement des fonctions sous
-- contrainte, les privilèges effectifs de chaque rôle — et le fait que rien
-- n'est créé en dehors du schéma `dripshot`, puisque le projet Supabase
-- héberge aussi une autre application.

create or replace function dripshot.t_assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok then raise notice 'ok     %', label;
  else raise exception 'ECHEC  %', label; end if;
end;
$$;

-- Deux comptes de test. Aucun trigger : les comptes Dripshot n'existent pas
-- encore à ce stade, c'est le premier usage qui les ouvre.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local');

-- 1. L'inscription seule ne crée rien : pas de trigger sur auth.users.
do $$
declare comptes integer;
begin
  select count(*) into comptes from dripshot.accounts;
  perform dripshot.t_assert(comptes = 0, 'auth.users : aucun trigger posé par Dripshot');
end;
$$;

-- 2. Le premier usage ouvre le compte, le second ne redonne pas de cadeau.
do $$
declare solde integer; encore integer; lignes integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  solde := dripshot.ensure_account();
  perform dripshot.t_assert(solde = 10, 'ouverture : 10 crédits offerts');

  encore := dripshot.ensure_account();
  select count(*) into lignes from dripshot.credit_entries;
  perform dripshot.t_assert(encore = 10, 'ouverture : second appel sans nouveau cadeau');
  perform dripshot.t_assert(lignes = 1, 'ouverture : une seule ligne d''historique');
end;
$$;

-- 3. Sans session, ni ouverture ni débit.
do $$
declare refus_ouverture boolean := false; refus_debit boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '', true);

  begin perform dripshot.ensure_account();
  exception when others then refus_ouverture := (sqlerrm = 'not_authenticated'); end;

  begin perform dripshot.spend_credits(1, 'anonyme');
  exception when others then refus_debit := (sqlerrm = 'not_authenticated'); end;

  perform dripshot.t_assert(refus_ouverture, 'ouverture : appel non authentifié refusé');
  perform dripshot.t_assert(refus_debit, 'débit : appel non authentifié refusé');
end;
$$;

-- 4. Débit nominal, puis solde insuffisant.
do $$
declare reste integer; leve boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  reste := dripshot.spend_credits(3, 'export de 3 photos');
  perform dripshot.t_assert(reste = 7, 'débit : 10 - 3 = 7');

  begin perform dripshot.spend_credits(100, 'export impossible');
  exception when others then leve := (sqlerrm = 'insufficient_credits'); end;
  perform dripshot.t_assert(leve, 'débit : solde insuffisant refusé');
end;
$$;

-- 5. Isolation RLS : chacun ne voit que ses lignes.
do $$
declare vus integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform dripshot.ensure_account();

  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  select count(*) into vus from dripshot.accounts;
  perform dripshot.t_assert(vus = 1, 'RLS : un seul compte visible');

  select count(*) into vus from dripshot.credit_entries
   where user_id = '22222222-2222-2222-2222-222222222222';
  perform dripshot.t_assert(vus = 0, 'RLS : historique du voisin invisible');
end;
$$;

-- 6. Un lot ne peut être ni créé ni réattribué au nom d'un autre.
do $$
declare refus_update boolean := false; refus_insert boolean := false; vus integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  insert into dripshot.batches (user_id, name, photo_count)
  values ('11111111-1111-1111-1111-111111111111', 'lot de A', 4);
  select count(*) into vus from dripshot.batches;
  perform dripshot.t_assert(vus = 1, 'lots : insertion pour soi acceptée');

  begin
    update dripshot.batches set user_id = '22222222-2222-2222-2222-222222222222';
  exception when others then refus_update := true; end;
  perform dripshot.t_assert(refus_update, 'lots : réattribution à autrui refusée');

  begin
    insert into dripshot.batches (user_id, name)
    values ('22222222-2222-2222-2222-222222222222', 'lot volé');
  exception when others then refus_insert := true; end;
  perform dripshot.t_assert(refus_insert, 'lots : insertion au nom d''autrui refusée');
end;
$$;

-- 7. Un client ne peut ni se créditer, ni ouvrir le compte d'un autre.
do $$
declare refus_grant boolean := false; refus_interne boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  begin perform dripshot.grant_credits('11111111-1111-1111-1111-111111111111', 500, 'auto-cadeau', null);
  exception when insufficient_privilege then refus_grant := true; end;
  perform dripshot.t_assert(refus_grant, 'recharge : interdite au client');

  begin perform dripshot.ensure_account_for('22222222-2222-2222-2222-222222222222');
  exception when insufficient_privilege then refus_interne := true; end;
  perform dripshot.t_assert(refus_interne, 'fonction interne : inaccessible au client');
end;
$$;

-- 8. Le webhook, lui, crédite — et une seule fois par session Stripe.
do $$
declare apres integer; rejoue integer; etat text;
begin
  -- Sous service_role de bout en bout, comme /api/checkout puis le webhook.
  set local role service_role;
  insert into dripshot.purchases (user_id, pack_id, credits, amount_cents, stripe_session_id, status)
  values ('11111111-1111-1111-1111-111111111111', 'pro', 500, 1499, 'cs_test_1', 'pending');

  apres := dripshot.grant_credits('11111111-1111-1111-1111-111111111111', 500, 'Pack pro', 'cs_test_1');
  perform dripshot.t_assert(apres = 507, 'recharge : 7 + 500 = 507');

  rejoue := dripshot.grant_credits('11111111-1111-1111-1111-111111111111', 500, 'Pack pro', 'cs_test_1');
  perform dripshot.t_assert(rejoue = 507, 'recharge : webhook rejoué sans double crédit');

  select status into etat from dripshot.purchases where stripe_session_id = 'cs_test_1';
  perform dripshot.t_assert(etat = 'paid', 'achat : statut passé à paid');
end;
$$;

-- 9. Rien n'a été créé en dehors de `dripshot` : le projet est partagé.
do $$
declare intrus integer;
begin
  select count(*) into intrus from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('welcome_credits', 'ensure_account', 'ensure_account_for',
                     'spend_credits', 'grant_credits', 'handle_new_user');
  perform dripshot.t_assert(intrus = 0, 'empreinte : aucune fonction posée dans public');

  select count(*) into intrus from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r';
  perform dripshot.t_assert(intrus = 0, 'empreinte : aucune table posée dans public');

  select count(*) into intrus from pg_trigger
   where tgrelid = 'auth.users'::regclass and not tgisinternal;
  perform dripshot.t_assert(intrus = 0, 'empreinte : aucun trigger posé sur auth.users');
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
     and c.connamespace = 'dripshot'::regnamespace
     and not exists (
       select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indkey[0] = a.attnum
     );
  perform dripshot.t_assert(manquantes = 0, 'schéma : toutes les FK sont indexées');
end;
$$;

-- 11. Toute table exposée a bien la RLS activée.
do $$
declare sans_rls integer;
begin
  select count(*) into sans_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'dripshot' and c.relkind = 'r' and not c.relrowsecurity;
  perform dripshot.t_assert(sans_rls = 0, 'schéma : RLS active sur toutes les tables');
end;
$$;

-- 12. Aucune policy ne rappelle auth.uid() ligne par ligne.
do $$
declare non_optimisees integer;
begin
  select count(*) into non_optimisees
    from pg_policies
   where schemaname = 'dripshot'
     and (coalesce(qual, '') || coalesce(with_check, '')) like '%auth.uid()%'
     and (coalesce(qual, '') || coalesce(with_check, '')) not like '%( SELECT auth.uid()%';
  perform dripshot.t_assert(non_optimisees = 0, 'RLS : auth.uid() toujours dans un sous-select');
end;
$$;
