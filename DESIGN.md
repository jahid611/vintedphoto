# Dripshot — identité, charte et écrans

Maquettes interactives (canvas façon Figma, 10 planches) :
**https://claude.ai/artifact/APBPZ16Tu3EGhg9Fd4xVTA**
*(privé — il faut le partager depuis le menu Share pour qu'un tiers l'ouvre.)*

---

## 1. Le nom

**dripshot** — toujours en un mot, toujours en bas de casse.

*Drip* est le mot de la cible pour « le style, la sape qui claque » ; *shot*
c'est la photo. Deux syllabes, ça se tape sans réfléchir, ça se prononce pareil
en français et en anglais, et ça ne dit pas « retouche photo » — ça dit
« ton article a de la gueule ».

Écartés : Fitshot (trop proche du fitness), Snapfit, Studio Fripe (trop
franco-français pour Depop), Cleanfit (descriptif, pas mémorable).

## 2. Le logo

Un **cintre dont le crochet est un objectif** : la fringue et la photo dans un
seul signe. Fichiers : `public/logo-mark.svg`, `public/logo-lockup.svg`,
`src/app/icon.svg` (icône d'app / favicon), et le composant `<Mark>` /
`<Wordmark>` dans `src/components/Brand.tsx`.

- Sous 28 px, le trait du crochet est épaissi (3,4 → 4,4) pour qu'il ne se
  referme pas visuellement. Le composant le fait tout seul.
- Zone de protection : la hauteur du crochet sur les quatre côtés.
- Mot : Bricolage Grotesque 800, bas de casse, interlettrage −0,04 em.
- Sur fond sombre : signe en teal-500, mot en #E8F2F2.

## 3. La charte

Famille **teal**, comme demandé — c'est la couleur du secteur, un vendeur
Vinted se sent immédiatement chez lui. La marque reste néanmoins distincte :
nom, signe et typo sont propres, et la marque Vinted n'est utilisée nulle part.
C'est une app tierce, pas une app officielle, et ça doit se voir.

| Rôle | Token | Hex |
|---|---|---|
| Teal profond | `brand-900` | `#073B3F` |
| Teal texte | `brand-800` | `#00565E` |
| **Teal primaire** | `brand-700` | `#007782` |
| Teal vif | `brand-500` | `#09B1BA` |
| Teal clair | `brand-200` | `#A9E3E6` |
| Teal teinte | `brand-50` | `#ECF8F8` |
| Encre | `ink` | `#0E1A1B` |
| Encre secondaire | `muted` | `#4A5C5D` |
| Filet | `line` | `#E4EDED` |
| Surface | `surface` | `#F3F7F7` |

### Accents fonctionnels — pastel

Chaque accent est une **paire** : un fond pastel et une encre de la même
teinte, lisible sur le pastel comme sur le blanc. Le teal reste la seule
couleur saturée de l'interface.

| Rôle | Fond | Encre | Contraste encre/fond |
|---|---|---|---|
| Promo, alerte douce | `#FFCFC4` | `#9B3624` | 5,1 : 1 |
| Crédits / jetons | `#FFE3AE` | `#8A5B00` | 4,7 : 1 |
| Succès | `#C6E9D4` | `#1C6B41` | 5,0 : 1 |
| Erreur | `#F9C9C6` | `#A02419` | 5,1 : 1 |

Mode sombre : `#0B1415` fond, `#132022` surface, `#E8F2F2` texte, `#09B1BA`
primaire. Les tokens basculent seuls (`prefers-color-scheme`), un attribut
`data-theme` permet de forcer l'un ou l'autre.

### Typographie

- **Bricolage Grotesque 800** pour les titres — caractère, un peu brut, colle à
  l'univers streetwear sans tomber dans le graffiti.
- **Instrument Sans** pour le texte — neutre, très lisible en petit.

Échelle : 38/40 titre d'accroche · 27 titre d'écran · 18–20 section ·
15–16 corps · 13 secondaire · 12 étiquette (majuscules, +1,4 px).

### Règles d'interface

Rayons : pilule 999 · carte 20 · champ 14 · vignette 12 · badge 8.
Base d'espacement 4, gouttière 20, **cible tactile 48 px minimum**.

## 4. Les écrans

| # | Écran | Route | Ce qui s'y joue |
|---|---|---|---|
| 01 | Landing | `/` | Avant/après en premier, CTA « 10 crédits offerts » |
| 02 | Studio | `/studio` | Zone de dépôt, appareil photo, derniers lots |
| 03 | Sélection | *(natif)* | Le sélecteur de fichiers du téléphone fait le travail |
| 04 | Traitement | `/traitement` | Anneau de progression, étapes, bandeau de vignettes |
| 05 | Éditeur | `/editeur` | Comparateur à volet, formats, lumière |
| 06 | Fonds & filtres | `/editeur` (onglets) | 6 fonds, 4 filtres lookbook |
| 07 | Lot & export | `/lot` | Grille, changement de format, ZIP |
| 08 | Crédits | `/credits` | Packs, historique, promesse de non-débit |

## 5. Décisions produit

**Le crédit n'est débité qu'à l'export réussi.** Un détourage raté ne coûte
rien. Ça enlève la peur de gâcher ses crédits en testant, et ça coupe l'essentiel
des demandes de remboursement. C'est écrit en clair sur l'écran des packs.

**Tout le traitement tourne sur l'appareil.** Aucune photo n'est envoyée sur un
serveur. Double bénéfice : l'argument de confidentialité, et un coût marginal
par photo proche de zéro — c'est ce qui permet de vendre 100 photos 4,99 € avec
une marge quasi totale. La base de données ne stocke que l'identité, le solde
et des métadonnées de lot.

**Grille tarifaire.** 10 crédits offerts, puis Starter 100 / 4,99 €,
Pro 500 / 14,99 € (0,03 € l'unité), Studio 2 000 / 39,99 € (0,02 € l'unité).
Pas d'abonnement : la cible a 18-25 ans et se méfie des prélèvements récurrents.

**Trois formats, pas trente.** Vinted 1:1, Depop 4:5, Story 9:16. Export en
1600 px — au-delà, les plateformes recompressent pour rien.
