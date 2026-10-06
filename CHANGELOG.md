# Changelog

## 0.4.0

### Ajouts

- `no-deep-import` : un dossier composant avec une entrée, ou un dossier en
  minuscules dont l'`index` réexporte depuis le dossier, s'importe par cette
  entrée ; l'import, la réexportation ou l'`import()` qui entre dans ses autres
  fichiers est signalé, en nommant le dossier le plus englobant à franchir.
- `declarative-entry` : un `index.ts` sans flux de contrôle, appel ni `await` au
  chargement ; l'`index` racine d'un package sans `exports` est un programme et
  n'est pas vérifié.
- `no-nested-jsx-map` : pas de `.map` dans le rappel d'un `.map` en JSX rendu.
- `no-catch-all-module` : pas de module nommé `utils`, `helpers`, `misc`, `common`,
  seul ou en suffixe ; options `names` et `allow`.
- `no-enum` : pas d'`enum`, `const enum` compris.

### Changements

- La détection de racine et la lecture des manifestes sont partagées entre toutes
  les règles (`src/locate.js`).

## 0.3.0

### Ajouts

- Les dossiers en minuscules (kebab-case ou préfixés par `_`) délimitent des
  regroupements : un consommateur extérieur compte à la racine du regroupement
  et ne fait pas déplacer la fonctionnalité chez lui ; un fichier enfoui utilisé
  depuis l'extérieur remonte à cette racine. Les dossiers PascalCase restent
  soumis à l'appartenance.
- `root` devient optionnel : sans option, chaque fichier est analysé dans le
  `src/` du package le plus proche ; la racine d'un workspace sans `src/` est
  ignorée. Une seule configuration couvre un monorepo.
- `__fixtures__/`, `__mocks__/` et `__snapshots__/` sont traités comme
  `__tests__/` ; les suffixes `.e2e.` et `.bench.` comme des tests.

### Changements

- Au-delà de quatre consommateurs, le message en cite trois et compte les autres.
- Le cache de graphes passe de 8 à 64 racines.

### Corrections

- Le câblage hors unité (routes, scripts) reste inerte même à travers une
  frontière de regroupement.

## 0.2.0

### Ajouts

- Règle `module-ownership` : place les hooks, types, helpers et dossiers de
  modules sous leur propriétaire, ou à l'ancêtre commun de leurs consommateurs.
  Les imports de types comptent comme appartenance.
- Règle `test-colocation` : place les tests et stories à côté de leur sujet,
  ou dans son sous-dossier `__tests__/`.
- Modèle d'unités partagé par les trois règles : composants, dossiers
  composants, dossiers de modules encapsulés, et modules isolés agissant pour
  l'unité qui les contient. Les registres hors unité (routes par convention de
  fichiers, câblage applicatif) ne possèdent plus de code.

### Changements

- `component-ownership` vérifie aussi les dossiers composants (`Child/index.tsx`).
- Les tests et stories ne bloquent plus l'analyse d'un composant : ils ne sont
  plus comptés comme consommateurs.
- Les messages nomment le fichier ou dossier concerné :
  `Review placement of Child.tsx under Parent/.`
- Le diagnostic d'analyse incomplète est émis une fois par règle activée.

### Corrections

- Les spécificateurs à protocole (`bun:test`, `cloudflare:`, `virtual:`) ne
  suspendent plus l'analyse.
- Un composant `Parent/Child/Child.tsx` correctement imbriqué n'est plus signalé.
- Un import ou réexport de types vers un fichier de déclaration ou un package
  sans code ne suspend pas l'analyse.
- Un `export type` ne protège que les modules de types, pas le composant qui
  déclare ces types.

### Performance

- La résolution de chaque fichier est partagée entre les règles : les trois
  règles ensemble coûtent autant que `component-ownership` seule en 0.1.1.

## 0.1.1

- Résolution des `exports` conditionnels réservés aux imports ESM.
- `Orders/Orders.tsx` reconnu comme propriétaire de `Orders/`.
- Un module JSX non PascalCase ne sert plus à déduire un propriétaire.

## 0.1.0

- Première version : règle `component-ownership`.
