# Club démo : Avenir Basket du Cens

Un club **fictif** mais crédible (Orvault, Loire-Atlantique), pour la vidéo de démo. Équipe vitrine : **Seniors Filles 1**, en _Régionale Féminine 1 · Poule B_, première de sa poule avec quelques défaites.

Tout est inventé : le club, les adversaires (clubs fictifs dans de vraies communes des Pays de la Loire), les salles, les joueuses, les numéros de licence.

| Fichier                             | Rôle                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `extension/`                        | Extension Chrome « Kluvo démo » : remplace l'API de prod par le club démo, dans le navigateur |
| `joueurs-avenir-basket-du-cens.csv` | 86 licenciés au format export FBI (82 joueurs + 4 dirigeants ignorés à l'import)              |
| `fake-ffbb-server.mjs`              | Faux `competitions.ffbb.com`, pour monter le club en vrai sur un environnement local          |

## Filmer sur la prod : l'extension

L'extension tourne dans la page (`world: "MAIN"`, `document_start`) et répond à chaque appel `/api/*` à la place du serveur. Rien n'atteint la prod, aucun compte n'est nécessaire, et la saison est générée à partir de la date du jour : le prochain match est toujours ce week-end.

```sh
node scripts/demo/extension/build.mjs
```

Puis `chrome://extensions` → Mode développeur → Charger l'extension non empaquetée → `scripts/demo/extension/dist/kluvo-demo`, et ouvrir `https://kluvo.net/dashboard?demo=coach`.

- `dist/kluvo-demo/config.js` : `played` (journées déjà jouées : 4, 6, 8 ou 12) et `persona` au premier chargement.
- `?demo=coach` / `?demo=joueuse` change de personne, <kbd>Alt</kbd>+<kbd>Maj</kbd>+<kbd>K</kbd> bascule, `?demo=reset` efface ce qui a été cliqué.
- Les réponses sont typées sur `@basketeasy/types` (`app/node_modules/.bin/tsc -p scripts/demo/extension`) : un changement de contrat casse le build ici plutôt qu'un écran pendant le tournage.
- Simulés : RSVP, trajet, convocations, vote MVP, lavage des maillots, feuille de marque (envoi → lecture → validation → stats), partage WhatsApp, notifications, création/modification/suppression d'événement. Non simulés : invitations, ajout de membres ou de joueurs, back-office.

## Monter le club en vrai (local)

Pour une base réelle plutôt qu'une démo dans le navigateur : importer le CSV, créer l'équipe avec l'URL FFBB ci-dessous et pointer le serveur sur le faux FFBB.

```sh
node scripts/demo/fake-ffbb-server.mjs --no-results   # 1er import : chaque match reçoit sa salle
FFBB_BASE_URL=http://localhost:4010 pnpm dev:server
```

URL FFBB de l'équipe : `https://competitions.ffbb.com/ligues/pdl/comites/0044/clubs/pdl0044958/equipes/200000006107744`. Relancer ensuite le faux serveur sans `--no-results` et réimporter : les journées jouées passent jouées, la salle reste. Ce faux serveur sert une poule de Départementale de 10 équipes, distincte de la R1 de l'extension.
