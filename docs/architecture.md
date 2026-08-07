# BasketEasy — Architecture

## Global (detailed)

```mermaid
%%{init: {'theme': 'neutral'}}%%
graph TB
  subgraph Client_Layer["Client Layer"]
    Web[React SPA<br/>Vite]
    PWA[PWA / mobile web wrapper]
  end

  subgraph Edge["Edge / Hosting"]
    CDN[CDN + Static Hosting<br/>Scaleway]
    LB[Load Balancer / Reverse Proxy<br/>Nginx or Traefik]
  end

  subgraph Backend_Layer["Backend - NestJS"]
    API[API Gateway<br/>REST]
    AuthSvc[Auth Service<br/>JWT + Refresh]
    Biz[Business Modules<br/>Clubs/Teams/Players/Scheduling]
    ScoreSvc[Scoresheet Service]
    PaySvc[Payments Service]
    Queue[Job Queue<br/>BullMQ + Redis]
    Notif[Notification Service<br/>email/push]
  end

  subgraph Data_Layer["Data Layer"]
    PG[(Postgres<br/>primary DB)]
    Redis[(Redis<br/>cache + queue)]
    S3[(Object Storage<br/>Scaleway S3 - scoresheet photos)]
  end

  subgraph External["External Services"]
    LLM[LLM Vision API<br/>scoresheet OCR/parsing]
    HelloAsso[HelloAsso API<br/>dues/payments]
    Email[Email Provider<br/>Brevo]
  end

  Web --> CDN
  PWA --> CDN
  Web -->|HTTPS| LB
  LB --> API
  API --> AuthSvc
  API --> Biz
  API --> ScoreSvc
  API --> PaySvc
  AuthSvc --> PG
  Biz --> PG
  Biz --> Redis
  ScoreSvc --> S3
  ScoreSvc -->|async job| Queue
  Queue --> LLM
  Queue --> PG
  PaySvc --> HelloAsso
  PaySvc --> PG
  Notif --> Email
  Biz --> Notif
  PaySvc --> Notif
```

---

## Frontend (detailed)

```mermaid
%%{init: {'theme': 'neutral'}}%%
graph TB
  subgraph Shell["App Shell"]
    Root[React Root]
    Router[Router - React Router]
    ErrBound[Error Boundary]
    ClubSwitcher[Multi-Club/CTC Context Switcher]
  end

  subgraph State["State Management"]
    Query[TanStack Query<br/>server state, caching]
    Store[Context<br/>local UI state]
    AuthCtx[Auth Context<br/>JWT, refresh, roles]
  end

  subgraph APILayer["API Layer"]
    Client[API Client<br/>fetch wrapper]
    Interceptor[Interceptors<br/>auth header, refresh, error handling]
  end

  subgraph Pages["Feature Pages"]
    Cal[Calendar / RSVP]
    Roster[Team Roster]
    ScoreUp[Scoresheet Upload]
    Dash[Club/CTC Dashboard]
    Pay[Dues / Payments]
    PlayTime[Fair Playing-Time View]
    Admin[Volunteer/Role Admin]
  end

  subgraph UI["Shared UI Kit"]
    Comp[Component Library<br/>buttons, forms, modals]
    Forms[Form Handling<br/>react-hook-form + zod]
    I18n[i18n - FR default]
  end

  Root --> Router
  Root --> ErrBound
  Root --> AuthCtx
  Root --> ClubSwitcher
  Router --> Cal
  Router --> Roster
  Router --> ScoreUp
  Router --> Dash
  Router --> Pay
  Router --> PlayTime
  Router --> Admin

  Cal --> Query
  Roster --> Query
  ScoreUp --> Query
  Dash --> Query
  Pay --> Query
  PlayTime --> Query
  Admin --> Query

  Query --> Client
  Client --> Interceptor
  Interceptor --> AuthCtx

  Cal --> Comp
  Roster --> Comp
  ScoreUp --> Comp
  Pay --> Forms
  Admin --> Forms
  Comp --> I18n
```

---

## Backend (detailed)

```mermaid
%%{init: {'theme': 'neutral'}}%%
graph TB
  subgraph Gateway["API Gateway"]
    Ctrl[Controllers<br/>REST endpoints]
    Guard[Guards<br/>JwtAuthGuard, RolesGuard]
    Interc[Interceptors<br/>logging, transform]
    Pipe[Validation Pipes<br/>DTOs + class-validator]
  end

  subgraph Modules["Feature Modules"]
    AuthMod[Auth Module<br/>login, refresh, JWT strategy]
    ClubMod[Clubs/CTC Module]
    TeamMod[Teams/Players Module]
    SchedMod[Scheduling Module<br/>créneaux + conflict detection]
    ScoreMod[Scoresheet Module]
    PayMod[Payments Module]
    SubvMod[Subvention Module]
    RoleMod[Volunteer/Role Module]
  end

  subgraph Async["Async Processing"]
    BullQueue[BullMQ Queue]
    Worker[Scoresheet Worker<br/>upload → LLM parse → write DB]
    CronJobs[Scheduled Jobs<br/>cert/subvention reminders, slot conflict checks]
  end

  subgraph DataAccess["Data Access"]
    Prisma[Prisma ORM]
    RepoLayer[Repository/Service Layer]
  end

  subgraph Infra["Infra Services"]
    ConfigMod[Config Module<br/>env, secrets]
    HealthMod[Health Checks]
    LoggerMod[Logger]
  end

  subgraph Externals["External Calls"]
    S3Client[S3 Client]
    LLMClient[LLM Vision Client]
    HelloAssoClient[HelloAsso Webhook/API Client]
    EmailClient[Email Client]
  end

  Ctrl --> Guard --> Pipe --> Interc
  Interc --> AuthMod
  Interc --> ClubMod
  Interc --> TeamMod
  Interc --> SchedMod
  Interc --> ScoreMod
  Interc --> PayMod
  Interc --> SubvMod
  Interc --> RoleMod

  ScoreMod --> S3Client
  ScoreMod --> BullQueue
  BullQueue --> Worker
  Worker --> LLMClient
  Worker --> RepoLayer

  PayMod --> HelloAssoClient
  SubvMod --> CronJobs
  SchedMod --> CronJobs
  RoleMod --> EmailClient
  CronJobs --> EmailClient

  ClubMod --> RepoLayer
  TeamMod --> RepoLayer
  SchedMod --> RepoLayer
  PayMod --> RepoLayer
  SubvMod --> RepoLayer
  AuthMod --> RepoLayer
  RepoLayer --> Prisma

  ConfigMod -.-> Modules
  HealthMod -.-> Gateway
  LoggerMod -.-> Modules
```

---

## DB (entity overview)

```mermaid
%%{init: {'theme': 'neutral'}}%%
erDiagram
  CLUB ||--o{ TEAM : has
  CTC ||--o{ CLUB : groups
  CTC ||--o{ TEAM : fields
  TEAM ||--o{ PLAYER : rosters
  TEAM ||--o{ MATCH : plays
  MATCH ||--o{ SCORESHEET : has
  MATCH ||--o{ PLAYING_TIME : records
  PLAYER ||--o{ PLAYING_TIME : has
  TEAM ||--o{ GYM_SLOT : booked_in
  CLUB ||--o{ PAYMENT : collects
  PLAYER ||--o{ PAYMENT : pays
  CLUB ||--o{ USER : has_volunteers
  USER ||--o{ ROLE : holds

  CLUB { uuid id string name string ffbb_code }
  CTC { uuid id string name }
  TEAM { uuid id string category uuid ctc_id }
  PLAYER { uuid id string first_name string last_name }
  MATCH { uuid id date played_at string opponent }
  SCORESHEET { uuid id uuid match_id string photo_url jsonb parsed_data }
  PLAYING_TIME { uuid id uuid player_id uuid match_id int minutes }
  GYM_SLOT { uuid id uuid team_id datetime start datetime end }
  PAYMENT { uuid id uuid player_id decimal amount string status }
  USER { uuid id string email }
  ROLE { uuid id string name }
```

---

## Repo ↔ architecture mapping

This monorepo currently scaffolds the **Client Layer** (`apps/web`) and the **API Gateway + Health** slice of the **Backend Layer** (`apps/api`). The domain modules (Auth, Clubs/Teams, Scheduling, Scoresheet, Payments, Subvention, Volunteer/Role), the BullMQ queue, and the external integrations (LLM vision, HelloAsso, Brevo) are not implemented yet — see `CLAUDE.md` and the feature list in `docs/feature-set.md` for what's next.
