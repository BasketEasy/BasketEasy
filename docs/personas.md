# Who uses Kluvo

The account type that outnumbers every other one is a plain licensed player, or the parent answering
for one. The app's information architecture was first built club-shaped (create a club, administer
it, list members, drill into a team); most accounts crossed those admin surfaces to reach three
facts about themselves. Every player-facing screen since starts from the people below.

## Personas (names used across mockups and fixtures)

**Léa Moreau, 24, senior player** (the majority case). Seniors Filles 1 at AS Saint-Herblain, a CTC
team shared with ESB Rezé. One roster slot, no admin rights. Opens the app about four times a week,
on a phone, for under a minute. Her questions:

1. « Je suis convoquée samedi ? »
2. « J'ai répondu ? » (and can I change it)
3. « C'est où, à quelle heure, comment j'y vais ? »
4. « Qui vient ? »
5. « C'est moi qui apporte les ballons ? »
6. « On a gagné combien ? J'ai marqué combien ? »
7. « Le vote est encore ouvert ? »

**Karim Benali, 41, parent of Yanis (U13).** Yanis has no phone. Karim reads the convocations,
answers, drives, and wants to know whether other parents go to the away match. Served by the
guardian model (`decisions/guardians.md`). Product copy on player-facing screens is adult-register
**« vous »** and never assumes the reader is the player. (The WhatsApp group message is the one
place that says « tu »: it is written to the team.)

**Inès Petit, 38, coach and still a player.** Coaches Seniors Filles 1, `TeamAdmin` of the U15
Filles, plays when the seniors are short. Her questions are Léa's plus « qui n'a pas répondu ? »,
« le groupe est-il fait pour samedi ? », « la feuille de match est-elle rentrée ? ». Her own RSVP
sits under the manager's pilot band so the double role is visible.

## The weekly loop

Trainings mid-week, matches on Saturday, scoresheet and vote in the days after. The app must answer
the loop in the fewest taps from launch: answer before the match, find the venue and the RDV, see
who is coming, read the result and vote after.

## Principles that came out of this

- **Two homes.** `/dashboard` branches on manage rights: a player's « Ma semaine » (what I owe,
  next event, 14 days ahead, last match, my season) and a manager's « Accueil » with an « À
  traiter » band (match without convocations, pending answers, unconfirmed scoresheet, players
  without an account). Nothing is taken away from a manager.
- **A decision the reader owes is answerable where it is shown** (RSVP and travel choice on the
  home, not only on the event page).
- **A bottom tab bar of four**, fixed by role: player « Ma semaine · Mon équipe · Résultats ·
  Profil », manager « Accueil · Équipes · Club · Profil ». The context is a gym: one hand, phone
  held low, poor light. « Créer un club » lives in the account menu.
- **The agenda looks 14 days ahead**, so next Saturday's match exists on a Wednesday.
- **The event page is ordered around the decision**, not tabs: decision band, « S'y rendre »,
  « Qui vient ? » for a player; pilot band, logistics, roster, « Après la rencontre » for a manager.
- A venue needs only a maps search link, not a geocode (the RDV feature geocodes, for driving time).

## Deliberately not proposed

- **A month-grid calendar.** A player asks « what's next and am I in it »; a grid answers a
  planner's question, and the planner is a manager on a desktop. Revisit as a manager-only view if
  P1 scheduling (créneaux) lands.
- **In-app chat.** The group already lives in WhatsApp; Kluvo feeds it (`decisions/guest-rsvp-and-whatsapp.md`).
- **A separate player app or route namespace.** Same routes, three role signals in the client.
- **A `jerseyNumber` column** for the player card: numbers change between matches
  (`decisions/scoresheets-and-stats.md`).
