# LandingOS

*AI agent index: [llms.txt](./llms.txt) · Canonical requirements: [`docs/landingos-mvp.md`](./docs/landingos-mvp.md)*

Mobile web/PWA for solo, budget travelers flying **Poland → Milan-Bergamo (BGY)**. After
landing at an unfamiliar airport, a traveler enters their flight number and a Milan
destination and gets up to three clear transit variants (recommended / fastest / simplest),
then optionally joins one temporary chat room shared by everyone on that flight to coordinate
public transport or a shared taxi. LandingOS does **not** sell tickets, take payments, or
verify boarding passes — purchase and navigation happen through external links.

The planner works with no one else in the room; the community layer is upside, not a dependency.

## Status

The repository is the `saas-on-cf` starter stack (see [Architecture](#architecture)); the
LandingOS product is **not yet implemented**. Delivery is tracked as an AFK issue queue:

| Issue | Slice | Scope |
|-------|-------|-------|
| [#1](https://github.com/auditmos/landingos/issues/1) | PRD | Canonical requirements + delivery index (mirror of `docs/landingos-mvp.md`) |
| #2 | S0 | Provider contracts + deterministic fixtures + data-spike harness |
| #4 | S1 | Flight recognition + manual fallback |
| #5 | S2 | Destination selection + Milan boundary |
| #6 | S3 | Journey recommendations + transfer-catalog model |
| #7 | S4 | Operator Console (transfer-catalog admin) |
| #3 | S5 | Auth — email OTP + pseudonym + marketing consent |
| #8 | S6 | Flight Room core (rooms, selection, chat) |
| #9 | S7 | Safety — block, report, community-rules acceptance |
| #10 | S8 | Lifecycle & privacy (closure, retention, deletion) |
| #11 | S9 | Analytics funnel |
| #12 | S10 | PWA / mobile-readiness hardening (Playwright E2E, manifest, native-API smoke) |

Each issue is self-contained with locked decisions and testable acceptance criteria. **Read the
issue before starting its slice.** All are completable unattended in `fixture` provider mode;
live provider credentials and privacy/compliance sign-off gate a *production pilot only*, never
code completion.

## Architecture

Monorepo using [pnpm workspace](https://pnpm.io/workspaces):

- [apps/user-application](./apps/user-application/) — TanStack Start SSR frontend (Polish UI)
- [apps/data-service](./apps/data-service/) — Hono REST + WebSocket API, Durable Objects, scheduled handlers
- [packages/data-ops](./packages/data-ops/) — Shared DB layer (schemas, queries, auth)

Stack: [TanStack Start](https://tanstack.com/start), [Hono](https://hono.dev), [Better Auth](https://www.better-auth.com/docs/introduction), [Drizzle ORM](https://orm.drizzle.team/docs/overview), [Cloudflare Workers](https://developers.cloudflare.com/workers/) (Durable Objects for real-time chat), [Neon Postgres](https://neon.tech).

Every package ships an `AGENTS.md` with structure, patterns, and workflows (`CLAUDE.md` symlinks to it). The root [`AGENTS.md`](./AGENTS.md) carries the cross-cutting LandingOS constraints agents must follow.

## Local setup

1. `pnpm install`
2. Provision a [Neon](https://neon.tech) Postgres database.
3. Create the per-environment env files (this repo has not run `init-project` yet — do so once, or fill the `*.example` templates directly):
   - `packages/data-ops/.env.{dev,staging,production}` — `DATABASE_HOST/USERNAME/PASSWORD` (see [.env.example](./packages/data-ops/.env.example))
   - `apps/user-application/.env{,.staging,.production}` — `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `BETTER_AUTH_BASE_URL`, `AUTH_EMAIL_FROM`, and the matching `VITE_API_TOKEN` / `DATA_SERVICE_API_TOKEN` / `API_TOKEN` triple
   - `apps/data-service/.dev.vars` (local) / Cloudflare dashboard (remote)
4. `pnpm run setup && pnpm run db:generate:dev && pnpm run db:migrate:dev`
5. Start dev in two terminals: `pnpm run dev:data-service` (port 8788) and `pnpm run dev:user-application` (port 3000).

External providers (flight/places/transit) run in **fixture mode** by default and need no
credentials — see issue #2 (S0) for the contract and how `live` mode is enabled.

## Development

```bash
pnpm run dev:user-application  # TanStack Start app (port 3000)
pnpm run dev:data-service      # Hono API service (port 8788)
```

### Database migrations

From the repo root (proxies to `packages/data-ops`):

```bash
pnpm run db:generate:dev   # Generate migration
pnpm run db:migrate:dev    # Apply to database
pnpm run db:pull:dev       # Pull schema from DB
pnpm run db:seed:dev       # Seed sample data
pnpm run db:studio         # Open Drizzle Studio (dev only)
```

Replace `dev` with `staging` or `production` (except `db:studio`, which is dev-only).

## Testing

```bash
pnpm run test              # run all tests
pnpm run test:watch        # watch mode
pnpm run test:coverage     # with coverage report
pnpm run types             # type-check all packages (builds data-ops first)
```

Uses [Vitest](https://vitest.dev) with workspace projects (Cloudflare Workers pool where
needed). Run tests + `types` before declaring a slice done — every issue requires
`lint`, `types`, and `test` to exit 0. Slice S10 adds Playwright E2E (`test:e2e`) and a
native-API smoke test (`smoke:native-api`).

## Deployment

```bash
pnpm run deploy:staging:user-application
pnpm run deploy:staging:data-service
pnpm run deploy:production:user-application
pnpm run deploy:production:data-service
```

Secrets sync: `bash apps/{app}/sync-secrets.sh {env}`. Fixture provider data must never render
in `staging`/`production`. See [`.claude/rules/cloudflare-deployment.md`](./.claude/rules/cloudflare-deployment.md) for hostname/SSL/redirect rules.

### Cloudflare account override

To deploy to a different CF account, copy `.env.example` to `.env` and fill in `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`.

## Planning skills (Brainstormer)

Planning skills ([brainstormer](https://github.com/auditmos/brainstormer)) are pre-configured via `extraKnownMarketplaces` / `enabledPlugins` in `.claude/settings.json` and install on first open. Update with `/plugin marketplace update brainstormer`.
