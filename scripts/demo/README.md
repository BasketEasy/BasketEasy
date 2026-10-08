# Club démo : Avenir Basket du Cens

Un club **fictif** mais crédible (Orvault, Loire-Atlantique), pour la vidéo de démo. Équipe vitrine : **Seniors Filles 1**, en _Départementale Féminine 1 · Poule A_.

Tout est inventé : le club, les adversaires (clubs fictifs dans de vraies communes du 44), les salles, les joueuses, les numéros de licence. Pas de vrai club, pas de vrais résultats attribués à quelqu'un.

| Fichier                             | Rôle                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `joueurs-avenir-basket-du-cens.csv` | 86 licenciés au format export FBI (82 joueurs + 4 dirigeants ignorés)    |
| `fake-ffbb-server.mjs`              | Faux `competitions.ffbb.com` : calendrier, salles, classement, résultats |

## 0. Fiche du club

| Champ             | Valeur                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Nom               | Avenir Basket du Cens                                                                                |
| Code club FFBB    | `pdl0044958`                                                                                         |
| Salle             | Salle des Prés du Cens, 44700 Orvault                                                                |
| Point de RDV club | Parking de la Salle des Prés du Cens, 44700 Orvault                                                  |
| Équipes (CSV)     | Seniors Filles 1 et 2, Seniors Garçons 1 et 2, U18 Garçons, U15 Filles, U13 Garçons, U11 Mixte       |
| URL FFBB équipe   | `https://competitions.ffbb.com/ligues/pdl/comites/0044/clubs/pdl0044958/equipes/200000006107744`     |
| Championnat       | Départementale Féminine 1 · Poule A, 10 équipes, 18 journées, trêve de 2 semaines après la journée 9 |

## 1. Override FFBB (obligatoire)

L'URL ci-dessus n'existe pas chez FFBB. Les trois appels qui scrapent FFBB partent **du serveur**, pas du navigateur : lier l'équipe (`POST …/ffbb-links`), importer le calendrier (`POST …/ffbb-import`), lire la poule (`GET …/ffbb-poule-results`).

### Option A (recommandée) : faux FFBB côté serveur

Le vrai parseur tourne, les matchs importés sont de vrais événements en base.

```sh
# 1er passage : aucun match joué, pour que l'import lise la salle de chaque match
node scripts/demo/fake-ffbb-server.mjs --no-results
# dans .env du serveur, puis redémarrer l'API
FFBB_BASE_URL=http://localhost:4010
```

Après le 1er import (étape 6), relancer **sans** `--no-results` puis réimporter : les 3 premières journées passent jouées, le classement et les résultats apparaissent, les salles restent.

- `--anchor 2026-10-17` : samedi du prochain match (défaut : samedi prochain). Les dates sont calculées depuis cette ancre, donc la saison est toujours « maintenant ». **Garder la même ancre** entre deux lancements, sinon un réimport déplace tous les matchs.
- `--played 3` : journées déjà jouées avant l'ancre.
- Les 3 dernières journées ont un horaire « à confirmer » (00:00 côté FFBB), comme en vrai.
- Serveur en Docker : `FFBB_BASE_URL=http://host.docker.internal:4010` (ajouter `extra_hosts: ["host.docker.internal:host-gateway"]` sous Linux).

### Option B : déploiement dont on ne peut pas changer l'env (DevTools)

```sh
node scripts/demo/fake-ffbb-server.mjs --anchor <même date> --dump-overrides ./overrides
```

Puis Chrome DevTools → Network → clic droit sur la requête → _Override content_, avec :

| Requête                                            | Fichier                   |
| -------------------------------------------------- | ------------------------- |
| `/api/clubs/<id>/teams/<id>/ffbb-links` (GET+POST) | `ffbb-links.json`         |
| `/api/clubs/<id>/teams/<id>/ffbb-import`           | `ffbb-import.json`        |
| `/api/clubs/<id>/teams/<id>/ffbb-poule-results`    | `ffbb-poule-results.json` |

Limite : rien n'est écrit en base. Les matchs doivent être créés à la main (même adversaire, date, salle que le calendrier du faux FFBB) avant le tournage, sinon l'agenda reste vide après le toast « import ». Vérifier en répétition que l'override remplace bien la réponse en erreur du `POST` (statut affiché dans l'onglet Network).

## 2. Environnement

| Variable                                      | Pour                                            | Sans                                                |
| --------------------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| `FFBB_BASE_URL`                               | Option A                                        | scrape du vrai FFBB → « lien injoignable »          |
| `BREVO_API_KEY` vide                          | liens de vérif/invitation écrits dans le log    | (c'est voulu en local)                              |
| `REDIS_URL`                                   | OCR feuille, gel des maillots, rappels WhatsApp | ces jobs ne tournent pas                            |
| `R2_*` + `GEMINI_API_KEY`                     | feuille de marque → stats                       | pas de stats ni d'onglet Statistiques rempli        |
| `ORS_API_KEY` (optionnel)                     | temps de trajet calculé, heure de RDV auto      | taper les minutes de trajet à la main (« Ajuster ») |
| `VAPID_*` (optionnel)                         | notifications push                              | toggle push masqué                                  |
| `JERSEY_DUTY_FREEZE_ENABLED=true` (optionnel) | attribution auto du lavage à J-0                | suggestion seulement                                |

## 3. Comptes à créer

Une adresse par persona (alias `+` sur une boîte à vous). Sans Brevo, chaque lien arrive dans le log serveur.

| Persona                                                  | Rôle dans la démo                                    |
| -------------------------------------------------------- | ---------------------------------------------------- |
| Hélène Cadiou                                            | crée le club (ADMIN), coach + `TeamAdmin` des SF1    |
| Léa Moreau                                               | joueuse SF1, capitaine, persona « joueuse »          |
| Chloé Bernard, Inès Traoré, Manon Lambert, Emma Fontaine | joueuses SF1 (RSVP, votes MVP crédibles)             |
| Marc Daniel (optionnel)                                  | parent de Louise Daniel (U15 Filles), persona parent |

## 4. Étapes, dans l'ordre

**Club**

1. Inscrire Hélène Cadiou, confirmer l'e-mail (lien dans le log). Obligatoire : créer un club est bloqué sans e-mail vérifié.
2. Créer le club « Avenir Basket du Cens », code FFBB `pdl0044958`.
3. Membres → Joueurs → « Importer les licenciés » → `joueurs-avenir-basket-du-cens.csv`. Le mapping se devine seul (`Catégorie`/`Équipe` restent non mappées, c'est voulu). Résultat attendu : **82 créés, 4 ignorés** (licences T et AS).
4. 39 mineurs remontent en « autorisation manquante » (l'import ne l'exige pas, c'est voulu). Pour un onglet Joueurs propre à l'écran, l'enregistrer pour chacun, sauf Louise Daniel si l'étape 15 est tournée (le parent la donne in-app).
5. Paramètres club → point de RDV par défaut : « Parking de la Salle des Prés du Cens », 44700 Orvault, marge 45 min.

**Équipe Seniors Filles 1**

6. Créer l'équipe : « Seniors Filles 1 », SENIORS, féminin, URL FFBB ci-dessus. Puis « Importer le calendrier FFBB » → **18 créés**. Option A : relancer ensuite le faux FFBB sans `--no-results` et réimporter (18 inchangés). Résultats de poule : 2 victoires, 1 défaite, 2e.
7. Effectif : ajouter les 12 joueuses (tableau ci-dessous), rôle PLAYER.
8. Admins : ajouter Hélène comme `TeamAdmin`.
9. Agenda : entraînements récurrents hebdo jusqu'au 30/06/2027, Salle des Prés du Cens :
   - mardi 20:00
   - jeudi 20:00
10. Inviter les 5 joueuses de la table « Comptes » (Membres → Joueurs → inviter → lien d'invitation, ouvert dans un autre navigateur/profil). Chaque compte se lie à sa fiche joueuse.
11. Lien invité RSVP (onglet équipe) : l'activer, le partager une fois dans « WhatsApp » pour le prochain match.
12. Prochain match : convoquer 10 joueuses sur 12 (laisser Zoé Petit et Camille Roux non convoquées, c'est crédible). Côté comptes joueuses : 3 « présente », 1 « peut-être », 1 « absente ». Choix trajet : 2 RDV, 1 directement à la salle.
13. Maillots : rotation active par défaut. Faire accepter le lavage du prochain match par la joueuse suggérée (si c'est un compte démo) ou l'attribuer à Léa côté coach.
14. Match J3 (joué) : téléverser une feuille de marque (voir « Feuille J3 »), confirmer le mapping des numéros → onglet Statistiques rempli. Faire voter le MVP par les 5 comptes joueuses (fenêtre : de 1 h à 5 jours après le coup d'envoi, donc **tourner dans les 5 jours qui suivent J3**, ou choisir `--anchor` en conséquence).

**Parent (optionnel)**

15. Créer l'équipe « U15 Filles » (U15, féminin), y mettre les 10 U15F du CSV, inviter Marc Daniel comme parent de Louise Daniel (consentement in-app), lui faire répondre au RSVP « pour Louise ».

**Avant de tourner**

16. Passer sur chaque écran filmé en répétition : tableau de bord coach, match à venir (timeline RDV → arrivée → coup d'envoi), agenda, classement de poule, stats, notifications, persona joueuse sur mobile.
17. Après tournage : supprimer le club depuis le back-office (compte staff `DATA_OFFICER`, `POST /admin/clubs/:clubId/delete`), qui emporte joueurs, équipes et événements.

## Effectif Seniors Filles 1

| N°  | Joueuse        | Note      |
| --- | -------------- | --------- |
| 4   | Léa Moreau     | capitaine |
| 5   | Chloé Bernard  |           |
| 6   | Camille Roux   |           |
| 7   | Inès Traoré    | meneuse   |
| 8   | Manon Lambert  |           |
| 9   | Emma Fontaine  |           |
| 10  | Jade Guérin    |           |
| 11  | Clara Le Gall  |           |
| 12  | Sarah Marchand |           |
| 13  | Zoé Petit      |           |
| 14  | Maëlys Perrin  |           |
| 15  | Amina Diallo   | pivot     |

Coach : Hélène Cadiou (licence T dans le CSV, donc pas sur l'effectif ; elle gère l'équipe en `TeamAdmin`).

## Feuille J3

Avenir Basket du Cens 63 – 50 Entente Treillières-Grandchamp (domicile). Les numéros sont ceux de l'effectif, à remplir à la main sur une feuille e-Marque vierge puis photographier. Répartition qui tombe juste :

| N°  | Joueuse       | Pts |
| --- | ------------- | --- |
| 7   | Inès Traoré   | 16  |
| 4   | Léa Moreau    | 12  |
| 9   | Emma Fontaine | 9   |
| 10  | Jade Guérin   | 8   |
| 5   | Chloé Bernard | 6   |
| 8   | Manon Lambert | 5   |
| 11  | Clara Le Gall | 4   |
| 15  | Amina Diallo  | 3   |

Autres résultats de l'équipe : J1 **62–53** contre Sainte-Luce Loire Basket (domicile), J2 **53–57** à Estuaire Basket La Montagne.
