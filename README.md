# oxlint-plugin-code-rules

[![CI](https://github.com/g-bastianelli/oxlint-plugin-code-rules/actions/workflows/ci.yml/badge.svg)](https://github.com/g-bastianelli/oxlint-plugin-code-rules/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/oxlint-plugin-code-rules)](https://www.npmjs.com/package/oxlint-plugin-code-rules)

Règles explicites d'organisation du code pour Oxlint, fondées sur le graphe
d'imports : chaque fichier vit sous son propriétaire, et le code partagé à
l'ancêtre commun le plus proche de ses consommateurs.

| Règle                            | Cible                                        |
| -------------------------------- | -------------------------------------------- |
| `code-rules/component-ownership` | Composants PascalCase et dossiers composants |
| `code-rules/module-ownership`    | Hooks, types, helpers et dossiers de modules |
| `code-rules/test-colocation`     | Tests et stories                             |

## Configuration

Le package est autonome, en ESM, sans compilation ni installation globale.
Il requiert `oxlint` ^1.85.0 en dépendance du projet :

```sh
bun add -d oxlint-plugin-code-rules
```

Puis, dans la configuration Oxlint :

```json
{
  "jsPlugins": [{ "name": "code-rules", "specifier": "oxlint-plugin-code-rules" }],
  "rules": {
    "code-rules/component-ownership": ["warn", { "root": "src" }],
    "code-rules/module-ownership": ["warn", { "root": "src" }],
    "code-rules/test-colocation": ["warn", { "root": "src" }]
  }
}
```

Chaque règle s'active séparément ; aucune ne l'est implicitement. Activées
ensemble, elles partagent un seul graphe par racine.

`root` est obligatoire et relatif au répertoire de travail du linter ; un chemin
absolu est également accepté. Choisir une racine contenant **tous les consommateurs**
du périmètre étudié, généralement le `src` d'un package. Les consommateurs hors de
cette racine ne sont pas découverts. Dans un monorepo, configurer chaque package
séparément. Les exclusions de diagnostic Oxlint ne réduisent pas le graphe : un
fichier ignoré peut toujours consommer un module.

## Modèle d'appartenance

Le graphe découpe la racine en **unités** :

- Un composant `Orders.tsx` (PascalCase, `.tsx`/`.jsx`) possède le dossier proposé `Orders/`.
- Un dossier composant `Orders/index.tsx` ou `Orders/Orders.tsx` possède `Orders/`.
- Un dossier de modules `orders/index.ts` possède `orders/` s'il est
  **encapsulé** : l'extérieur n'y entre que par son point d'entrée. Un dossier
  atteint par des imports profonds (`routes/`, `lib/`) n'est qu'un regroupement.
- Un module isolé (`columns.tsx`, `useOrders.ts`) situé dans une unité agit pour
  elle : il possède ses voisins, sans créer de dossier.
- Un module isolé hors de toute unité (registre de routes, `main.tsx`, câblage
  applicatif) référence du code sans le posséder : ce qu'il consomme ne reçoit
  aucune suggestion. Les routes par convention de fichiers n'ont donc pas
  besoin de configuration particulière.

Les dossiers **kebab-case** (`command-palette/`, `data-access/`, ou un seul
mot comme `reorder/`) définissent des frontières de regroupement sans liste de
configuration. Le nom doit commencer par une lettre minuscule et ne contenir
que des lettres minuscules, chiffres et tirets séparant des segments non vides.
Les dossiers **PascalCase** désignent les composants et restent soumis à
l'appartenance, même lorsqu'ils possèdent déjà leur propre dossier.

La frontière la plus proche s'applique à chaque fichier. Un consommateur
extérieur compte comme un consommateur à la racine de ce regroupement : il ne
fait pas déplacer la fonctionnalité chez lui. Un fichier enfoui utilisé depuis
l'extérieur doit cependant remonter à cette racine. À l'intérieur, les enfants,
hooks et types privés restent contrôlés, à toute profondeur ; les tests restent
colocalisés avec leur sujet, même à travers une frontière. Un point d'entrée du
regroupement n'entraîne jamais le déplacement du regroupement entier.

Cette convention exprime une décision architecturale par le nom : elle ne prouve
pas la cohérence métier du dossier. Un hook dans `data-access/` consommé depuis
une autre fonctionnalité reste donc dans `data-access/`. Un hook privé placé à
la racine de sa fonctionnalité est, lui, rapproché de son composant consommateur.
Renommer un dossier en kebab-case change cette interprétation.

L'emplacement attendu d'un fichier est l'ancêtre commun le plus proche des
dossiers de ses propriétaires :

- Un seul consommateur : sous le dossier de ce propriétaire.
- Plusieurs consommateurs : à leur ancêtre commun le plus proche.
- Aucun consommateur : aucune déduction.

Les tests et stories ne sont jamais propriétaires : un composant testé reste
analysé. Les imports de types comptent pour les modules (un `types.ts` appartient
à ceux qui l'utilisent) mais pas pour les composants, possédés par ceux qui
les rendent.

```text
Orders/
├── index.tsx
├── SharedBadge.tsx          # utilisé par Row et EmptyState
├── useOrders.ts             # hook privé de Orders
├── useOrders.test.ts        # colocalisé avec son sujet
├── types.ts                 # types partagés par Table et EmptyState
├── Table/
│   ├── index.tsx
│   ├── columns.tsx          # agit pour Table
│   └── Row/
│       ├── index.tsx
│       └── Menu/
│           ├── index.tsx
│           └── Action.tsx
└── EmptyState/
    └── index.tsx
```

Les règles ne demandent pas de créer un `index.tsx`, ne déplacent aucun fichier
et ne réécrivent aucun import. Elles utilisent les imports comme indication
d'appartenance, sans prétendre déterminer les frontières métier. Une chaîne à
plat peut demander plusieurs passes : déplacer le propriétaire modifie
l'emplacement de ses enfants. Les tests couvrent cinq niveaux de convergence
et six niveaux de branches, dont des composants partagés à un ancêtre
intermédiaire.

## component-ownership

Signale les fichiers PascalCase `.tsx` et `.jsx` contenant du JSX, et les
dossiers composants (`Child/` est signalé via `Child/index.tsx`), placés ailleurs
qu'à l'emplacement attendu. Le diagnostic est ancré sur le premier JSX.

## module-ownership

Signale les autres modules : hooks, types, schémas, helpers, contextes, et les
dossiers de modules encapsulés. Un `index.*` de simple regroupement n'est jamais
déplacé. Le diagnostic est ancré sur la première instruction.

## test-colocation

Signale un fichier `*.test.*`, `*.spec.*`, `*.stories.*` ou situé sous
`__tests__/` qui n'est pas à côté de son sujet. Le sujet est le module importé
portant le même nom (`useOrders.test.ts` → `useOrders.ts`,
`Orders/index.test.tsx` → `Orders/`). Le test peut vivre dans le dossier du
sujet ou dans son sous-dossier `__tests__/`. Sans sujet unique, aucune déduction.

## Résolution et limites

Les alias `tsconfig`, les imports `.js` vers TypeScript, les `exports`
conditionnels (`node`, `import`) et les imports dynamiques à chaîne littérale
sont résolus avec Oxc. Les spécificateurs à protocole (`node:`, `bun:`,
`cloudflare:`, `virtual:`) sont externes. Les fichiers réexportés et les cibles
source de `package.json#exports` sont protégés. Les fichiers impliqués dans un
cycle d'appartenance ne reçoivent pas de suggestion. Un `export type` protège
un module de types, mais pas le composant qui déclare ces types. Les liens de
type non résolus (fichiers `.d.ts`, packages sans code) ne suspendent pas
l'analyse. Un `index.*` à la racine câble le package sans posséder ce qu'il
importe.

Si le graphe ne peut être établi (erreur de parsing, import de code non résolu,
import dynamique calculé, `require` ou appel `import.meta` calculé), chaque règle
activée explique une fois pourquoi l'analyse du périmètre est suspendue. Les
dossiers générés usuels (`node_modules`, `.git`, `.moon`, `dist`, `build`,
`coverage`, `paraglide`) et les fichiers `.d.ts` sont exclus ; les liens
symboliques ne sont pas suivis. Un fichier PascalCase `.tsx` sans JSX n'est
signalé par aucune règle.

## Performance et cache

L'implémentation utilise `createOnce`, des visiteurs ciblés et le retour `false`
de `before` pour les fichiers sans diagnostic. Oxlint exécutant toutes les règles
d'un fichier à la suite, la résolution du fichier est partagée entre les règles. Le graphe utilise le résumé ESM
du parseur Oxc ; un AST supplémentaire n'est matérialisé que pour examiner les
imports calculés ou les formes non-ESM.

Le cache est partagé pendant un lot synchrone. Entre les lots, les métadonnées
des fichiers, dossiers et configurations JSON ancêtres sont revérifiées ; seules
leurs modifications entraînent un nouveau parsing. Une modification du texte
courant invalide également le graphe. Le cache est borné à huit racines.
Il n'y a ni watcher permanent ni cache disque. Le texte courant fourni
par Oxlint est pris en compte ; les autres fichiers sont lus sur disque.
Les modifications non enregistrées dans d'autres buffers d'éditeur ne sont donc
pas disponibles. Les configurations étendues situées hors de la racine et de ses
dossiers ancêtres nécessitent un redémarrage du linter après modification.
Un test avec le vrai serveur `oxlint --lsp` vérifie l'ouverture, les modifications
du buffer courant et l'ajout d'un consommateur enregistré. Une modification dans
un autre fichier prend effet au prochain lint du composant : le plugin ne demande
pas lui-même au serveur de relinter ses dépendants.

Le benchmark lance réellement Oxlint sur 6 400 fichiers répartis en arbres
à six niveaux. Après une chauffe, cinq exécutions alternent avec et sans les
trois règles. Il vérifie les diagnostics, publie les mesures dans `bench/results.json`
et impose un budget local de 1 000 ms en médiane. Ce budget dépend de la machine
et ne constitue pas une mesure du lint complet de Notom.

## Développement

```sh
bun install --ignore-scripts
moon run code-rules:test
moon run code-rules:lint
moon run code-rules:format
moon run code-rules:benchmark
```

Moon requiert un historique Git initialisé. Les commandes CLI sous-jacentes
sont déclarées dans `moon.yml`.
Les tests utilisent `node:test`, le `RuleTester` officiel d'Oxlint et le binaire
réel. Chaque fixture crée un dossier temporaire nettoyé après son test.
Un test crée aussi l'archive, l'installe dans un projet temporaire et charge le
plugin par son nom de package.

La CI GitHub Actions exécute tests, lint et format sur Node 20, 22 et 24.
Le `RuleTester` d'Oxlint exige Node 22 ; sous Node 20, sa suite est ignorée et
seuls les tests avec le binaire réel s'exécutent.

### Publication

1. Mettre à jour `version` dans `package.json` et `meta.version` dans
   `src/index.js` (un test vérifie leur cohérence).
2. Committer, puis pousser un tag `v<version>` : `git tag v0.2.0 && git push origin v0.2.0`.
3. Le workflow `Release` vérifie que le tag correspond à la version, rejoue les
   contrôles, publie sur npm avec provenance et crée la release GitHub.

La publication utilise le trusted publishing npm (OIDC) s'il est configuré pour
ce dépôt sur npmjs.com, sinon le secret de dépôt `NPM_TOKEN`.

Les dépendances sont épinglées. Compatibilité testée avec Oxlint 1.85.0 et 1.86.0 ; son API
de plugins JavaScript est encore alpha. L'export par défaut du point d'entrée est
le format attendu par Oxlint ; les modules internes utilisent des exports nommés.
Ajouter les futures règles séparément sous `src/rules/`, sans les activer
implicitement et sans dupliquer les règles natives d'Oxlint.

## Références

- [Configuration des plugins JavaScript](https://oxc.rs/docs/guide/usage/linter/js-plugins.html)
- [API, createOnce, before et RuleTester](https://oxc.rs/docs/guide/usage/linter/writing-js-plugins.html)
- [Analyse multi-fichiers native](https://oxc.rs/docs/guide/usage/linter/multi-file-analysis)

Les recommandations de cache du package sont notre choix d'implémentation,
pas une garantie de cycle de vie fournie par l'API Oxlint. Le benchmark doit
être relancé lors d'une mise à jour du moteur.
