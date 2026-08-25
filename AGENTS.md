# LandingOS

Mobile web/PWA that helps a solo/budget traveler flying **Poland → Milan-Bergamo (BGY)**
plan the trip from the airport to a Milan address (up to three transit variants) and
coordinate with others on the same flight via one temporary per-flight chat room.

- **Canonical product requirements:** [`docs/landingos-mvp.md`](./docs/landingos-mvp.md) (mirrored in GitHub issue #1). It is the single source of truth — treat it as authoritative over this file when they disagree.
- **Delivery queue:** GitHub issues #2–#12 (`S0`–`S10`), each a self-contained AFK slice with locked decisions and acceptance criteria. Read the relevant issue before implementing a slice.
- **Current state:** the repo is still the `saas-on-cf` starter (TanStack Start + Hono + Drizzle/Better Auth on Cloudflare). No LandingOS domain code exists yet — S0 (issue #2) is the first slice. The `health` domain is a retained starter example; the `client` domain was removed (issue #35).

## Tech boundary (fixed — do not swap)

TanStack Start (SSR frontend) + Hono API, both on Cloudflare Workers; Better Auth; shared
Drizzle/Postgres (Neon) data layer. Real-time chat uses one Durable Object per canonical
flight instance (Hibernation WebSocket API); Postgres stays the source of truth.

## Packages

| Package | Purpose |
|---------|---------|
| `packages/data-ops` | Shared DB layer (Drizzle, Zod, Better Auth). Domain barrels: `src/{domain}/index.ts` |
| `apps/data-service` | REST + WebSocket API (Hono on CF Workers), Durable Objects, scheduled handlers |
| `apps/user-application` | SSR frontend (TanStack Start on CF Workers), Polish UI |

Each has its own `AGENTS.md` with package-specific patterns (`CLAUDE.md` symlinks to `AGENTS.md`).

## The five deep modules (build these behind stable interfaces)

1. **Flight Context Resolver** — flight number + date → canonical `FlightInstance` (or typed `manual_required`). Provider hidden behind an adapter.
2. **Journey Recommendation Engine** — arrival + private destination + buffer → ≤3 normalized `JourneyVariant`s, merging transit provider with the seeded BGY transfer catalog. No trustworthy route is a valid domain outcome, never a fabricated one.
3. **Flight Room** — one room per canonical flight instance; pseudonyms, one transport selection, one shared message stream.
4. **Identity & Safety** — email OTP + Bearer, pseudonyms, block/report, community-rules acceptance, `operator` role, separate marketing consent.
5. **Operator Console** — authenticated Polish admin panel for BGY transfer-catalog CRUD, over the same API.

## Non-negotiable constraints (agents violate these silently — don't)

<important if="you are implementing, testing, or reviewing any LandingOS slice (S0–S10)">
- **Provider modes:** all external data (flight, places, transit) sits behind provider-neutral contracts with two modes — `fixture` (deterministic, checked-in, the default for local dev + CI + AFK work) and `live` (explicit config/credentials, **never selected implicitly**). Fixture data must never render when `CLOUDFLARE_ENV` is `staging` or `production`. Missing live credentials never block implementation, tests, or issue closure.
- **AFK model:** issues #2–#12 are completable unattended (code, fixtures, migrations, tests, docs). Two prerequisites gate only a *production pilot*, never code completion: (1) live-provider measurement + commercial/licensing acceptance, (2) independent privacy/compliance approval. **Never silently claim either is satisfied.** Production readiness fails closed until both are recorded.
- **Privacy invariants:** the exact destination (display text, place ID, coordinates) is private planner data — it must never appear in room/member responses, system messages, analytics events, or logs. Email is never public. Verify with leak scans, not by inspection.
- **Corridor scope:** origin = any direct PL flight to BGY; destination = Milan only (soft-but-enforced via `milan-municipality-v1` viewport; out-of-area returns a controlled `destination_not_supported`, no routing call). Do not widen scope.
- **No payments, ever:** MVP takes no payment, splits no cost, sells no ticket, verifies no boarding pass. Purchase/taxi/navigation happen through explicit external links on a host allowlist.
- **Polish UI:** all user-facing copy, validation, and error messages are Polish. Code/identifiers stay in English.
- **Deep modules:** keep provider/storage/delivery choices as module internals. Where an issue locks an architecture decision (e.g. WebSocket-vs-SSE, Postgres-vs-DO storage), it is already decided — do not re-litigate it.
</important>

## Commands

```bash
pnpm run setup                    # install + build data-ops
pnpm run dev:user-application     # frontend dev (port 3000)
pnpm run dev:data-service         # API dev (port 8788)
pnpm run db:generate:dev / db:migrate:dev / db:seed:dev / db:studio   # (also :staging / :production)
pnpm run deploy:staging:user-application / deploy:staging:data-service # (also :production:*)
pnpm run lint                     # biome check all
pnpm run lint:fix                 # auto-fix all
pnpm run test / test:watch / test:coverage
```

Later AFK slices add non-interactive root scripts (per their issues): `spike:data` / `spike:data:fixtures` (S0), `test:e2e` / `smoke:native-api` (S10).

## Verification

Lint auto-runs via PostToolUse hook on Edit/Write (biome check --write).
Max 500 lines per source file — split if exceeding.

<important if="you have finished implementing or modifying code">
Run manually before declaring done:
1. `pnpm run types` — type-check all packages (builds data-ops first)
2. `pnpm run test` — run all tests
Both must exit 0. Do not claim a slice done until its issue's acceptance-criteria tests pass.
</important>

<important if="you are creating, reviewing, or updating design documents">
- `/docs` is the single source of truth for business requirements (`docs/landingos-mvp.md` is canonical)
- Apply review notes/status updates directly in the corresponding design doc
- Never create separate md files for reviews/audits/analyses unless explicitly asked
- Flag implementation deviations inline in the doc
</important>
