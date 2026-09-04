# Monitoring Kluvo

Supervision complète de la prod avec **uniquement ce qui est déjà inclus** dans Scaleway (Cockpit) et Cloudflare (Workers Analytics, Analytics Engine, R2 Metrics, Notifications) — pas de service tiers, budget cible ~1-2 €/mois hors domaine.

**Périmètre supervisé**

| Quoi                                          | Où                                    | Comment                                  |
| --------------------------------------------- | ------------------------------------- | ---------------------------------------- |
| Instance `kluvo-back` (CPU/RAM/disque/réseau) | Scaleway Cockpit                      | `scaleway-vmagent` — natif, gratuit (§1) |
| Postgres, Redis (dans les conteneurs)         | Scaleway Cockpit                      | exporters + Grafana Alloy (§2)           |
| Logs `server` + `caddy`                       | Scaleway Cockpit (Loki)               | Alloy, optionnel et facturé (§3)         |
| Alertes                                       | Cockpit / Grafana Alerting            | règles sur §1 et §2 (§4)                 |
| Frontend (trafic, erreurs)                    | Cloudflare Workers Analytics          | inclus, rien à configurer (§5)           |
| Disponibilité de l'API vue de l'extérieur     | Cloudflare Cron + Analytics Engine    | `app/worker/index.ts` (§5)               |
| Stockage R2 (backups, photos)                 | Cloudflare R2 Metrics + Notifications | inclus (§6)                              |

**Ce que ce repo contient** (le reste se fait en console) :

```
infra/monitoring/
  docker-compose.monitoring.yml       exporters Postgres/Redis + agent Alloy
  docker-compose.monitoring-logs.yml  overlay optionnel : logs → Cockpit
  .env.monitoring.example             URL de push + token Cockpit
  alloy/metrics.alloy                 scrape des exporters, push vers Cockpit
  alloy/optional/logs.alloy           logs Docker → Cockpit (désactivé par défaut)
app/worker/index.ts                   Worker frontend + health-check planifié
app/wrangler.jsonc                    Cron Trigger + binding Analytics Engine
```

---

## 1. Remettre en route les métriques natives de l'instance (gratuit)

Constat du 04/09/2026 : le dashboard Cockpit « Instance Overview » est **entièrement vide**, CPU compris — `scaleway-vmagent` est absent ou arrêté sur l'instance. Les métriques natives sont gratuites, c'est donc la première chose à rétablir.

```bash
ssh -i ~/.ssh/id_ed25519_kluvo root@<IP>
systemctl status scaleway-vmagent
```

Si absent ou inactif (Ubuntu 24.04) :

```bash
sudo add-apt-repository ppa:scaleway/stable
sudo apt update
sudo apt install scaleway-vmagent
sudo systemctl enable --now scaleway-vmagent
```

Vérifier quelques minutes plus tard dans **console.scaleway.com → Instances → `kluvo-back` → Metrics**, ou **Cockpit → Dashboards → Scaleway → Instance Overview**, que CPU/RAM/disque/réseau remontent.

Si Grafana affiche `Failed to upgrade legacy queries datasource was not found` (message différent d'un simple « No data ») : **Cockpit → Data sources → Trigger synchronization**, ou

```bash
scw cockpit grafana sync-data-sources project-id=<PROJECT-ID>
```

## 2. Métriques Postgres / Redis via Grafana Alloy

`scaleway-vmagent` ne voit que la VM, jamais l'intérieur des conteneurs. Il faut un agent applicatif qui scrape des exporters Prometheus et pousse vers Cockpit.

1. **Cockpit → Tokens** → créer un token avec la permission **push** sur les métriques (et sur les logs seulement si §3 est activé).

2. Relever l'URL de push des métriques dans **Cockpit → Data sources** (elle dépend de la région du projet — ne pas la deviner).

3. Déposer la configuration sur l'instance, depuis une copie locale du repo :

   ```bash
   scp -r infra/monitoring/alloy \
          infra/monitoring/.env.monitoring.example \
          root@<IP>:/opt/kluvo/monitoring/
   scp infra/monitoring/docker-compose.monitoring*.yml root@<IP>:/opt/kluvo/
   ```

   Sur l'instance, renseigner l'URL et le token :

   ```bash
   cd /opt/kluvo/monitoring
   mv .env.monitoring.example .env.monitoring
   chmod 600 .env.monitoring
   $EDITOR .env.monitoring
   ```

   Arborescence attendue sur `kluvo-back` :

   ```
   /opt/kluvo/
     docker-compose.yml                  (existant, prod)
     docker-compose.monitoring.yml
     docker-compose.monitoring-logs.yml
     monitoring/
       .env.monitoring
       alloy/metrics.alloy
       alloy/optional/logs.alloy
   ```

4. Démarrer, **en overlay du compose de prod** (même projet Compose, donc même réseau : les exporters résolvent `postgres` et `redis` par nom de service, et Alloy résout les exporters) :

   ```bash
   cd /opt/kluvo
   docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
   docker compose -f docker-compose.yml -f docker-compose.monitoring.yml ps
   ```

   Ne pas lancer l'overlay seul (`docker compose -f docker-compose.monitoring.yml up`) : il créerait un projet distinct, sur un autre réseau, et les exporters ne verraient ni Postgres ni Redis.

   ⚠️ Le déploiement automatique (`.github/workflows/deploy.yml`) fait `docker compose up -d` **sans** l'overlay. Tant que la commande de déploiement n'inclut pas les deux fichiers (variable `COMPOSE_FILE` dans `/opt/kluvo/.env`, ou modification du workflow), un déploiement ne coupe pas les conteneurs de monitoring déjà lancés mais ne les recrée pas non plus après un `docker compose down`.

5. Vérifier que l'agent scrape et pousse :

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.monitoring.yml logs alloy | tail -50
   ```

6. **Cockpit → Grafana → Import dashboard** :
   - postgres_exporter : ID **9628**
   - redis_exporter : ID **763**

**Coût** : contrairement aux métriques natives (§1, gratuites), tout ce qui est poussé par un agent tiers est facturé à l'usage par Cockpit. `metrics.alloy` fixe donc un `scrape_interval` de 60s, largement suffisant ici — le baisser multiplie directement la facture.

## 3. Logs applicatifs (optionnel, facturé)

Centraliser les logs `server` + `caddy` dans Cockpit (Loki) pour chercher un incident sans `ssh` + `docker compose logs` — utile pour un bug du type `Cross-site request rejected`.

```bash
cd /opt/kluvo
cp monitoring/alloy/optional/logs.alloy monitoring/alloy/logs.alloy
docker compose -f docker-compose.yml \
               -f docker-compose.monitoring.yml \
               -f docker-compose.monitoring-logs.yml up -d
```

L'overlay `-logs` est séparé parce qu'il monte le socket Docker dans Alloy (un accès root de fait sur l'hôte) : on ne le donne pas par défaut à un agent qui n'en a pas besoin pour les métriques. Renseigner `COCKPIT_LOGS_PUSH_URL` dans `.env.monitoring` et donner au token la permission push sur les logs.

Consultation : **Cockpit → Grafana → Explore** → source de données Loki → filtrer sur le label `container`.

Pour désactiver : supprimer `monitoring/alloy/logs.alloy` et relancer sans l'overlay `-logs`.

## 4. Alerting (Cockpit / Grafana Alerting, inclus)

**Cockpit → Grafana → Alerting → New alert rule.** Les expressions ci-dessous sont à coller dans la requête de la règle.

⚠️ Vérifier d'abord les noms de séries dans **Explore** : celles de §1 viennent de `scaleway-vmagent` et suivent la convention node_exporter, mais les libellés exacts peuvent varier selon la version de l'agent. Une règle qui interroge une série inexistante ne se déclenche jamais — et ne le dit pas.

| Alerte              | Expression                                                                                             | Seuil / durée    | Pourquoi                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------- |
| Instance down       | `absent_over_time(node_cpu_seconds_total[5m])`                                                         | `== 1`           | plus aucune métrique CPU : serveur ou agent tombé                            |
| Disque plein        | `100 * (1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})` | `> 80` — 5 min   | **prioritaire** : 7,9 Go utilisables, un `no space left on device` déjà vécu |
| RAM haute           | `100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)`                              | `> 85` — 10 min  | Stardust1-S a peu de RAM ; alerter avant l'OOM, malgré le swap               |
| Postgres connexions | `sum(pg_stat_activity_count) / max(pg_settings_max_connections)`                                       | `> 0.8` — 5 min  | anticiper une saturation du pool                                             |
| Redis mémoire       | `redis_memory_used_bytes / redis_memory_max_bytes`                                                     | `> 0.85` — 5 min | éviter éviction / anomalies BullMQ                                           |
| Exporter muet       | `up{job=~"postgres\|redis"}`                                                                           | `== 0` — 10 min  | sinon les quatre règles ci-dessus s'arrêtent silencieusement                 |

Si `maxmemory` n'est pas configuré sur Redis, `redis_memory_max_bytes` vaut 0 : surveiller alors `redis_memory_used_bytes` en valeur absolue, rapporté à la RAM de l'instance.

**Canal de notification** : **Cockpit → Grafana → Alerting → Contact points** → email (le plus simple, inclus). Déclencher un test depuis le contact point pour valider la chaîne — une alerte qui n'arrive nulle part ne vaut pas mieux que pas d'alerte.

## 5. Cloudflare — trafic frontend et disponibilité de l'API

**Workers Analytics** (inclus, déjà actif) : dash.cloudflare.com → **Workers & Pages** → `kluvo` → onglet **Analytics**. Rien à configurer ; compter jusqu'à ~30 min d'ingestion après du trafic réel.

**Health-check planifié** (déployé par ce repo) : le Worker `kluvo` portait jusqu'ici uniquement des assets statiques. `app/worker/index.ts` lui ajoute :

- un `scheduled` déclenché toutes les 5 min (`triggers.crons` dans `app/wrangler.jsonc`) qui appelle `https://api.kluvo.net/api/health`, mesure la latence et écrit un point dans le dataset Analytics Engine `kluvo_health` (binding `HEALTH_AE`) ;
- un `fetch` qui délègue au binding `ASSETS`, donc **le même comportement qu'avant** : les requêtes correspondant à un asset ne passent même pas par le Worker, et le reste retombe sur `index.html` via `not_found_handling: single-page-application`.

C'est le seul point du dispositif qui observe l'API depuis l'extérieur de l'instance : lui seul distingue « l'API répond mal » de « l'instance entière est tombée ».

Le déploiement passe par le workflow existant `deploy-frontend.yml`, sans changement. Deux points à surveiller au premier déploiement :

- si le compte n'a pas Analytics Engine actif, `wrangler deploy` échoue sur le binding : retirer le bloc `analytics_engine_datasets` de `app/wrangler.jsonc` (le code gère déjà `HEALTH_AE` absent, le health-check continue de tourner et de logger) ;
- vérifier ensuite le site (une page profonde, ex. `https://kluvo.net/dashboard`) pour confirmer que le fallback SPA fonctionne toujours.

Relecture des données : `wrangler tail` pour le direct, et l'API SQL Analytics Engine pour l'historique :

```sql
SELECT
  blob1 AS outcome,
  blob2 AS http_status,
  double2 AS latency_ms,
  timestamp
FROM kluvo_health
WHERE timestamp > NOW() - INTERVAL '24' HOUR
ORDER BY timestamp DESC
```

(`double1` vaut 1/0 : sa moyenne sur une fenêtre donne le taux de disponibilité.)

## 6. R2 — métriques et alerte d'usage

1. dash.cloudflare.com → **R2 object storage** → bucket (`kluvo-backups`, puis le bucket photos) → onglet **Metrics**.
2. dash.cloudflare.com/notifications → créer une alerte sur l'usage R2 / la facturation, pour être prévenu **avant** de sortir du tier gratuit (10 Go).

## 7. Dashboard d'ensemble

Dans **Cockpit → Grafana**, créer un dashboard « Kluvo — Overview » regroupant sur une page les panels utiles pris dans : Instance Overview (§1), postgres_exporter (§2), redis_exporter (§2), et si §3 est activé un panel Loki des dernières erreurs.

Cloudflare reste dans son propre tableau de bord : agréger Workers Analytics et R2 dans Grafana supposerait d'exporter ces données vers Prometheus, hors du périmètre « outils inclus ».

## 8. Checklist de validation

- [ ] `systemctl status scaleway-vmagent` = `active` sur `kluvo-back`
- [ ] « Instance Overview » affiche CPU/RAM/disque/réseau sur les dernières 24 h
- [ ] `postgres-exporter`, `redis-exporter` et `alloy` sont `Up` (`docker compose ... ps`)
- [ ] Les logs d'Alloy ne montrent ni erreur de scrape ni erreur de push
- [ ] Dashboards 9628 (Postgres) et 763 (Redis) importés et alimentés
- [ ] Au moins la règle « disque plein » active (prioritaire vu les 7,9 Go)
- [ ] Contact point email configuré **et testé**
- [ ] Workers Analytics affiche des requêtes récentes pour `kluvo`
- [ ] `https://kluvo.net/dashboard` répond toujours après le déploiement du Worker
- [ ] Le dataset `kluvo_health` reçoit un point toutes les 5 min
- [ ] R2 Metrics affiche des données pour `kluvo-backups`
- [ ] (optionnel) logs `server`/`caddy` visibles dans Explore

## 9. Coûts

| Poste                                                                     | Coût                               |
| ------------------------------------------------------------------------- | ---------------------------------- |
| Métriques natives Scaleway (`scaleway-vmagent`, §1)                       | **gratuit**                        |
| Métriques poussées par Alloy vers Cockpit (§2)                            | facturé à l'usage                  |
| Logs poussés vers Cockpit (§3)                                            | facturé à l'usage                  |
| Cloudflare Workers Analytics, Analytics Engine, R2 Metrics, Notifications | **inclus** dans les plans utilisés |

Budget serré : garder le scrape à 60s et laisser §3 désactivé. Le reste (instance, frontend, R2, alerting) est couvert sans coût variable.
