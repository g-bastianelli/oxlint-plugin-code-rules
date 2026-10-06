# Changelog

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
