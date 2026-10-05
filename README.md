# oxlint-plugin-code-rules

[![CI](https://github.com/g-bastianelli/oxlint-plugin-code-rules/actions/workflows/ci.yml/badge.svg)](https://github.com/g-bastianelli/oxlint-plugin-code-rules/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/oxlint-plugin-code-rules)](https://www.npmjs.com/package/oxlint-plugin-code-rules)

Règles explicites d'organisation du code pour Oxlint. Première règle :
`code-rules/component-ownership`.

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
    "code-rules/component-ownership": ["warn", { "root": "src" }]
  }
}
```

`root` est obligatoire et relatif au répertoire de travail du linter ; un chemin
absolu est également accepté. Choisir une racine contenant **tous les consommateurs**
du périmètre étudié, généralement le `src` d'un package. Les consommateurs hors de
cette racine ne sont pas découverts. Dans un monorepo, configurer chaque package
séparément. Les exclusions de diagnostic Oxlint ne réduisent pas le graphe : un
fichier ignoré peut toujours consommer un composant.

## component-ownership

La règle suggère un emplacement pour les fichiers PascalCase `.tsx` et `.jsx`
contenant du JSX :

- Un seul consommateur : sous le dossier de ce propriétaire.
- Plusieurs consommateurs : à leur ancêtre commun le plus proche.
- Aucun consommateur : aucune déduction.

Un propriétaire `Orders.tsx` correspond au dossier proposé `Orders/`.
Un propriétaire `Orders/index.tsx` correspond au dossier existant `Orders/`.
La règle ne demande pas de créer un `index.tsx`, ne déplace aucun fichier et
ne réécrit aucun import. Elle utilise les imports de valeurs comme indication
d'appartenance, sans prétendre déterminer les frontières métier.

```text
Orders/
├── index.tsx
├── SharedBadge.tsx          # utilisé par Row et EmptyState
├── Table/
│   ├── index.tsx
│   └── Row/
│       ├── index.tsx
│       └── Menu/
│           ├── index.tsx
│           └── Action.tsx
└── EmptyState/
    └── index.tsx
```

L'arbre peut comporter plusieurs niveaux et branches. Une chaîne à plat peut
demander plusieurs passes : déplacer le propriétaire modifie l'emplacement de
ses enfants. Les tests couvrent cinq niveaux de convergence et six niveaux de
branches, dont des composants partagés à un ancêtre intermédiaire.

Les alias `tsconfig`, les imports `.js` vers TypeScript et les imports dynamiques
à chaîne littérale sont résolus avec Oxc. Les imports de types sont exclus.
Les fichiers réexportés et les cibles source de `package.json#exports` sont
protégés. Les composants cycliques et ceux consommés par des fichiers non-JSX,
tests ou stories ne reçoivent pas de suggestion de placement.

Si le graphe ne peut être établi (erreur de parsing, import de code non résolu,
import dynamique calculé, `require` ou appel `import.meta` calculé), un diagnostic
explique pourquoi l'analyse du périmètre est suspendue. Les dossiers générés
usuels (`node_modules`, `.git`, `.moon`, `dist`, `build`, `coverage`, `paraglide`)
et les fichiers `.d.ts` sont exclus ; les liens symboliques ne sont pas suivis.
Les projets qui découvrent leurs routes par convention de fichiers doivent
exclure ces points d'entrée des diagnostics de placement via leur configuration
Oxlint. La règle ne connaît pas les conventions des frameworks.

## Performance et cache

L'implémentation utilise `createOnce`, des visiteurs ciblés et le retour `false`
de `before` pour les fichiers sans diagnostic. Le graphe utilise le résumé ESM
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
à six niveaux. Après une chauffe, cinq exécutions alternent avec et sans la
règle. Il vérifie les diagnostics, publie les mesures dans `bench/results.json`
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
