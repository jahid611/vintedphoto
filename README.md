# dripshot

Tes sapes en mode studio. Une web app mobile-first qui prend les photos de
fringues prises à l'arrache et en sort des visuels propres, au bon format pour
Vinted et Depop : fond détouré, lumière corrigée, cadrage carré.

Identité, charte et maquettes : **[DESIGN.md](./DESIGN.md)**

---

## Le choix technique

**TypeScript + Next.js (App Router) + Tailwind CSS**, et **tout le traitement
d'image dans le navigateur**.

C'est le choix qui fait tenir le modèle économique. Le détourage tourne sur
l'appareil de l'utilisateur (ONNX Runtime via WebGPU, repli WASM), donc :

- **coût marginal par photo ≈ 0** — vendre 100 photos 4,99 € garde une marge
  quasi totale, là où un détourage serveur coûterait en GPU à chaque image ;
- **les photos ne quittent jamais le téléphone**, ce qui est un argument de
  vente réel, pas une ligne de politique de confidentialité ;
- **pas d'app store** : un lien, ça s'ouvre, ça se partage, ça s'installe en
  raccourci d'écran d'accueil. La cible ne télécharge pas une app pour tester
  un outil.

Un back Python + file d'attente GPU aurait été plus simple à écrire, mais
transforme chaque photo en coût variable — et tue la promesse « 5 € les 100 ».

## Démarrer

```bash
npm install
npm run dev          # http://localhost:3000
```

Sans configuration, l'app tourne en **mode démo** : le solde de crédits vit
dans le navigateur et le bouton d'achat crédite localement. Suffisant pour
développer et faire une démo, jamais pour encaisser.

```bash
npm run build        # build de production
npm run typecheck
npm run lint
```

## Le pipeline d'image

`src/lib/image/` — quatre étapes, dans cet ordre :

1. **Détourage** (`segment.ts`) — `@imgly/background-removal`, modèle chargé
   une fois puis réutilisé pour tout le lot. Si le modèle est injoignable ou
   que le détourage échoue, le pipeline **ne s'arrête pas** : il sort la photo
   avec lumière + format seuls, et ne débite aucun crédit.
2. **Correction automatique** (`adjust.ts`) — deux corrections séparées, et
   c'est délibéré :
   - la **balance des blancs** compare les hautes lumières de chaque canal ;
     sa force totale est bornée (`MAX_CAST_CORRECTION`), sinon une photo
     remplie de rouge saturé se fait repeindre en rose délavé ;
   - la **courbe de tons** ne travaille que sur la luminance, les trois canaux
     étant ensuite remis à l'échelle dans le même rapport. Un étirement affine
     canal par canal amplifierait la dominante au lieu de la corriger.
3. **Composition** (`compose.ts`) — recadrage serré sur l'alpha du sujet, pose
   sur le fond choisi, ombre portée douce dérivée de l'alpha, voile et grain
   du filtre.
4. **Export** — JPEG qualité 92 (PNG si fond transparent), 1600 px, sans
   filigrane. Le lot part en ZIP.

Le paramètre `NEXT_PUBLIC_BG_REMOVAL_PATH` permet d'héberger soi-même les
poids du modèle plutôt que de dépendre du CDN de l'éditeur.

## Tests

Le parcours est vérifié dans un vrai navigateur, avec deux contrôles chiffrés
sur la correction automatique — ils ont attrapé trois régressions réelles
qu'aucun test unitaire n'aurait vues.

```bash
npm run build && npm start &
npm run fixtures          # génère les photos de test (aucune dépendance)
npm run e2e               # nécessite: npx playwright install chromium
```

Les deux scènes de test sont choisies pour les deux pièges opposés :

| Fixture | Piège | Contrôle |
|---|---|---|
| `chambre-*.png` | ampoule jaune, sous-exposé | l'écart R-B du fond doit tomber sous 25 (il entre à ~48) |
| `pull-rouge.png` | rouge saturé plein cadre | la chroma doit rester au-dessus de 0,6 |

Variables : `BASE_URL`, `CHROMIUM_PATH`.

## Passer en production

### 1. Supabase

Le solde doit faire autorité côté serveur : en mode démo il suffit d'éditer le
`localStorage` pour se créditer à l'infini.

1. Créer un projet sur [supabase.com](https://supabase.com).
2. Appliquer `supabase/migrations/0001_init.sql` (SQL Editor, ou
   `supabase db push`).
3. Activer les **connexions anonymes** : Authentication → Providers → Anonymous.
   Personne ne remplit un formulaire avant d'avoir vu ce que l'outil fait de sa
   première photo ; le compte se rattache à un e-mail plus tard sans perdre les
   crédits.
4. Renseigner `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` et
   `SUPABASE_SERVICE_ROLE_KEY` (voir `.env.example`).

Ce que le schéma garantit :

- le solde n'est modifiable que par les fonctions `spend_credits` et
  `grant_credits` (`SECURITY DEFINER`) — aucune policy d'écriture directe sur
  `profiles` ;
- `spend_credits` débite de façon atomique : deux exports simultanés ne peuvent
  pas faire passer le solde sous zéro ;
- `grant_credits` est réservée au rôle `service_role` et **idempotente** sur
  l'identifiant de session Stripe : un webhook rejoué ne crédite pas deux fois ;
- RLS partout, chacun ne lit que ses propres lignes ;
- aucune photo en base — uniquement identité, solde et métadonnées de lot.

### 2. Stripe

1. `STRIPE_SECRET_KEY` et `NEXT_PUBLIC_SITE_URL`.
2. Webhook vers `/api/stripe/webhook`, événement
   `checkout.session.completed`, puis `STRIPE_WEBHOOK_SECRET`.

`POST /api/checkout` crée la session et n'ajoute **jamais** de crédits ; seul
le webhook crédite, après signature vérifiée (HMAC SHA-256, fenêtre de 5 min).

## Structure

```
src/app/            écrans (/, /studio, /traitement, /editeur, /lot, /credits)
src/app/api/        checkout Stripe + webhook
src/components/     marque, icônes, comparateur avant/après, navigation
src/lib/image/      le pipeline (détourage, correction, composition)
src/lib/            crédits, presets, store des lots, clients Supabase
supabase/           migration SQL (schéma, RLS, RPC)
scripts/            fixtures et parcours e2e
```
