# LandingOS threat model and security contract

Status: repository-specific contract for the supported `main` branch. Last grounded against the
repository on 2026-07-28.

This document defines which security outcomes LandingOS promises and how to decide whether a
candidate finding is reportable. It is not a claim that every invariant is already perfectly
implemented, a production-readiness approval, or a vulnerability-hunting checklist.

## Evidence and interpretation

Repository evidence has two roles:

- [`docs/landingos-mvp.md`](docs/landingos-mvp.md) is the canonical product contract.
- Current source, migrations, and `wrangler.jsonc` files establish what a deployed build actually
  exposes. Tests are supporting evidence only for the behavior they exercise.

When these disagree, do not silently choose the convenient interpretation. A mounted route or bound
component remains in review scope even if a document calls it starter code; a documented future
feature is not reachable merely because it appears in a PRD. Conflicts and missing operational facts
are listed under [Open questions](#open-questions-requiring-maintainer-confirmation).

The production pilot is currently blocked on live-provider commercial/licensing acceptance and
independent privacy/compliance approval. See
[`docs/privacy/production-release-status.md`](docs/privacy/production-release-status.md) and
[`docs/evidence/s0-provider-readiness.md`](docs/evidence/s0-provider-readiness.md). That gate does not
make intended staging/production code paths out of scope, but nobody may assume that a public
production deployment or those external approvals already exist.

## Purpose and system boundary

LandingOS is a Polish mobile web/PWA for a traveler flying directly from Poland to
Milan-Bergamo (BGY). An anonymous traveler resolves a flight, selects a private Milan destination,
and receives up to three ground-transport variants. After email-OTP authentication, the traveler may
join one temporary room for the canonical flight instance, publish a pseudonym and coarse transport
selection, exchange room messages, block or report another member, and delete their account.

LandingOS does not take payment, sell or store tickets, verify boarding passes or identity, order a
taxi, provide private messages, or promise that room members are genuine passengers. External
purchase and navigation are explicit trust transfers to allowlisted HTTPS hosts.

### Major components

| Component | Security-relevant responsibility and evidence |
|---|---|
| User Application Worker | TanStack Start SSR UI, Better Auth OTP endpoints, profile and account-deletion APIs, response security headers, and a service binding to the Data Service. Entry point: `apps/user-application/src/server.ts`; routes: `apps/user-application/src/routes/`. |
| Data Service Worker | Public planner REST API, authenticated room/safety/operator APIs, internal lifecycle endpoint, provider adapters, cron entry point, and the Flight Room Durable Object binding. Route composition: `apps/data-service/src/hono/app.ts`; Worker entry: `apps/data-service/src/index.ts`. |
| Shared data layer | Drizzle schemas, queries, Zod wire contracts, Better Auth configuration, role command, and Neon connection setup in `packages/data-ops/src/`. Both Workers can access the same Postgres database. |
| Neon Postgres | Source of truth for auth records, canonical flights, rooms, membership, selections, messages, one-time WebSocket ticket hashes, reports, catalog data, and analytics. Tables are defined in `packages/data-ops/src/**/table.ts` and `packages/data-ops/src/drizzle/auth-schema.ts`. |
| Flight Room Durable Object | One coordinator named by canonical flight-instance ID. It holds hibernating sockets and an alarm, not chat history; Postgres remains authoritative. See `FlightRoomDurableObject` in `apps/data-service/src/durable-objects/flight-room.ts`. |
| External services | Cloudflare Turnstile and Email Sending; in explicit `live` mode, Aviationstack and Google Places/Routes. Adapter construction and egress are in `apps/data-service/src/providers/`; email delivery is in `apps/user-application/src/lib/auth-email.ts`. |
| Operator tooling | Database-only `operator:role:{env}` command grants/revokes `operator`; no HTTP role-management endpoint exists. See `packages/data-ops/src/operator/role-command.ts` and root `package.json`. |
| Build and release | pnpm workspace and lockfile, Vite/Wrangler builds, Drizzle migrations, GitHub Actions, and secret-sync scripts. These are maintainer/CI inputs, not public runtime APIs. |

There is no runtime plugin or extension API, user file upload/import, payment processor, native
application, service worker, general OS IPC, or active webhook surface in the current build. The
example queue/workflow and `ExampleDurableObject` are not bound by the checked-in Wrangler
configuration. The mounted `/clients` example is different and is explicitly covered below.

## Supported deployment and configuration states

| State | Security interpretation |
|---|---|
| Local/dev (normal development default) | `CLOUDFLARE_ENV=dev`. Missing `LANDINGOS_PROVIDER_MODE` selects deterministic checked-in `fixture` adapters. Turnstile may be absent and is then disabled. CORS admits only the two local User Application origins. This is suitable for local/CI behavior, not evidence of Internet-facing anti-abuse controls. |
| Staging/production (intended supported model) | Two Cloudflare Workers on separate custom domains (`staging.landingos.app` / `api-staging.landingos.app`, or `landingos.app` / `api.landingos.app`), Neon Postgres, a `FLIGHT_ROOM` Durable Object, cron, rate-limit bindings, Email Sending, and explicit secrets. See both `apps/*/wrangler.jsonc`. |
| Provider mode outside dev | `LANDINGOS_PROVIDER_MODE=live` and exact provider selections/credentials are required. Explicit fixture mode is rejected and missing mode/credentials produces an unavailable provider, rather than silently serving fixture data. This is implemented by `resolveProviderConfig` in `apps/data-service/src/providers/provider-config.ts`. |
| Bot protection outside dev | The User Application refuses to serve if `TURNSTILE_SECRET_KEY` is absent. Data Service `/flights/resolve` returns a controlled failure if its Turnstile secret is absent. OTP protection is configured in `createBetterAuth`; flight lookup uses `turnstileGuard`. |
| E2E/native smoke harness | `scripts/e2e-fixture-server.ts`, mock auth, fixture stores, and local WebSocket helpers are test-only. Success there is not, by itself, proof of production cookie, CORS, provider, or infrastructure behavior. |
| Unsupported/unusual | Fixture data in staging/production, a modified/self-hosted runtime, arbitrary additional origins, a native client not present in this repository, malicious environment values, local source changes, or direct database edits outside documented operator/migration commands. A finding depending on one of these needs a separate reason it can arise from an untrusted boundary in a supported deployment. |

`.github/SECURITY.md` supports `main`; this repository does not define security support for old
releases or forks with changed trust assumptions.

## Protected assets and promised properties

| Asset | Required property |
|---|---|
| Email and auth identity | Email is accepted for OTP login and stored in Better Auth but is never a public profile or room field. Login must not reveal whether an account previously existed. User-controlled profile updates cannot set `role`; `role` is configured with `input: false` in `createBetterAuth`. |
| Starter `clients` records | `packages/data-ops/src/client/table.ts` separately stores name, surname, and email. The repository does not establish these as intentionally public data, while their read routes are mounted anonymously. Treat them as PII under review until the surface's intended support/access policy is confirmed below. |
| OTPs, sessions, Bearer tokens, and cookies | Only a correct, unexpired OTP within its attempt budget may create a session. Session/Bearer credentials authenticate only their owner and must not be exposed to other users or browser storage by LandingOS. Account deletion invalidates the deleted user's auth records. |
| Infrastructure and application secrets | Database credentials, `BETTER_AUTH_SECRET`, provider keys, Turnstile secret, analytics HMAC secret, Cloudflare deploy token, and server-to-server token must not enter public bundles, public responses, analytics, fixtures, evidence, or logs. A `VITE_*` value is browser configuration and must not be treated as a confidential secret. |
| Exact destination | Display text, place ID, and coordinates are private planner data. They may exist in the requesting browser flow and the minimum live Places/Routes request, but must not enter room/member payloads, messages or system events, account/profile tables, catalog rows, analytics, or application logs. See the “Privacy and lifecycle” section of the MVP and the boundary tests under `scripts/*privacy-boundary.test.ts`. One consented exception (decision 2026-08-05): the traveler may explicitly share a bounded free-text drop-off label (`dropOffText`, ≤120 chars) inside their own room selection — hidden by default, revocable anytime. Place IDs and coordinates remain banned without exception. |
| Room association and content | A room member may see pseudonyms, coarse selections, and non-purged messages only for a room they joined and only before its close boundary. Email is never room-visible; the exact destination is never room-visible except as the optional `dropOffText` label the traveler explicitly shared in their own selection. Membership means a self-asserted association with a flight, not verified passenger status. |
| Room isolation | One room maps to one persisted canonical flight instance, including its date. Different flight instances must not share memberships, history, tickets, sockets, or events. `flight_rooms.flight_instance_id` is unique and each Durable Object is named with the flight-instance coordinator key. |
| Safety data | Blocks are enforced in server-side history and real-time delivery for the blocker. A report must be made by a member of that room and must target another member or that room's message. Message evidence is internal and retained only to the room's normal purge boundary. |
| Operator authority and catalog | Only a current server-verified `operator` role may read or mutate the operator catalog API. Operator status grants catalog authority only; it does not grant access to exact destinations, room content, reports, arbitrary user records, or role management. Published catalog entries must be complete, fresh, and use an approved HTTPS URL. |
| Account lifecycle | Deletion acts only on the authenticated account and requires a session fresh within five minutes. It removes identity/membership/selection data, tombstones authored messages, detaches report identity, clears verification records, and broadcasts redaction. The exact matrix is `docs/privacy/retention-account-deletion.md`. |
| Retention | At `scheduledArrivalUtc + 24h`, the room is inaccessible for listing, history, REST mutation, new/reconnected WebSockets, and live sockets. At close + 30 days, message text and report evidence become eligible for the next bounded scheduled purge from active Postgres, with no open-report exception. Scheduling/batch delay must not reopen user access. |
| Analytics | Events are limited to the schema registry in `packages/data-ops/src/analytics/schema.ts`; no arbitrary metadata, email, exact destination, or message text is accepted. Authenticated actor IDs are HMAC-SHA-256 pseudonyms using a dedicated secret of at least 32 characters. Funnel IDs are correlation values, not authentication secrets. |
| Planner/catalog correctness | Flight results are normalized to BGY, the normal destination-selection flow rejects coordinates outside `milan-municipality-v1`, provider failures produce typed fallback/unavailable states, and the journey engine must not fabricate a trustworthy route. Stale/incomplete catalog rows are not used as published recommendations. A correctness failure is security-relevant only when it also causes a protected security impact described below. |
| External navigation | LandingOS emits only validated HTTPS URLs on the host allowlist in `packages/data-ops/src/journey/external-links.ts` and does not initiate payment. Once the user deliberately opens an approved site, that site's content, redirects, account, purchase, and navigation security are outside LandingOS control. |
| Availability | The project promises bounded request schemas, provider timeouts, controlled failures, idempotent message retries, and bounded cleanup batches. It does not promise a formal SLA or resistance to Cloudflare/provider-wide outages. A reportable DoS must demonstrate practical, sustained impact or material billable-resource abuse in the supported configuration. |
| Memory safety and cryptography | Application code is TypeScript/JavaScript on managed Cloudflare runtimes; it does not claim native memory-safety enforcement. It relies on platform/library cryptography for Better Auth, Web Crypto, TLS, and random values. Chat and Postgres data are not application-level end-to-end or at-rest encrypted by this repository. |

## Attacker profiles

| Profile | Starts with / controls | Reachable boundary | Explicitly does not control |
|---|---|---|---|
| Anonymous Internet client | Its HTTP client, IP-originating requests, request bodies, ordinary headers, query strings, timing/concurrency, flight/date, destination text/place ID/coordinates, and funnel ID. In a real Cloudflare deployment it cannot set the edge-authenticated meaning of `CF-Connecting-IP`. | Public User Application pages/auth endpoints and public Data Service health/planner routes, including anonymous `/flights/manual`. | A valid session, another user's email inbox, operator role, server env, service binding, Durable Object internal headers, database, provider response, or Cloudflare account. |
| Cross-site web attacker | A different web origin plus links, navigations, forms, scripts, and social interaction it can cause in a victim's browser. | Browser CORS/preflight, cookie, Origin/CSRF, external-navigation, and authentication boundaries. | LandingOS origin content, readable credentialed responses without CORS permission, HttpOnly credentials, a Turnstile success, or victim/operator authority merely by hosting another site. |
| Authenticated ordinary user | Everything above plus its own valid cookie or Better Auth Bearer token, pseudonym, room join requests, coarse selection, message text, report/block inputs, and its own account deletion. It may self-assert any known/persisted canonical flight; no boarding pass is checked. | Authenticated room/safety/profile/account APIs and rooms it has joined. User-controlled room text reaches other current members' React UI and internal report snapshots. | Another user's credential or inbox, membership in a room it has not joined, `operator` role, another account's deletion, raw database access, internal lifecycle token, or approved-host infrastructure. |
| Malicious or compromised room member | An authenticated user's room-visible pseudonym, selection, messages, connection timing, and safety requests. It can retain anything legitimately displayed and can put personal data or social-engineering content in chat. | Other members of the same open room and the report/block subsystem. | Other flight rooms, recipients' devices, mutual identity verification, operator powers, or the ability to make another member transact inside LandingOS. |
| Operator account | All ordinary-user capabilities plus server-authorized CRUD of transfer-catalog drafts/publication and allowlisted catalog text/URLs. | `/operator/catalog` and the normal user surfaces. | Role grant/revoke, arbitrary database rows, exact planner destinations, chat/report reading by virtue of role, secrets, Worker config, or Cloudflare/Neon administration. |
| External provider or network service | Its own availability and response JSON; the request fields deliberately sent to it. Places/Routes can observe destination query/place ID/coordinates in live mode. Email delivery observes recipient and OTP; Turnstile observes challenge data. | Provider normalizers, timeout/error handling, and results shown to the requester. | Better Auth cookies/secrets, chat, room membership, catalog database, unrelated user email, or arbitrary outbound destination URLs chosen at runtime. TLS/platform compromise is a different precondition. |
| Supply-chain contributor/dependency | A published dependency or GitHub Action controls code only after maintainers/automation select and execute it. A repository writer controls source, workflows, manifests, and migrations. | Install/build/test/release jobs and, if shipped, both Workers. | Production credentials merely by proposing an untrusted pull request; GitHub/Cloudflare/Neon administration unless a workflow or deployed application actually exposes it. Possession of trusted repository write or release credentials is already a privileged compromise. |
| Infrastructure/operations administrator | Cloudflare, Neon, email/provider, GitHub, DNS, or secret-store administration as granted by the owner. | Data, logs, deployments, backups, configuration, and credentials in that provider's control. | This profile is trusted for this repository-level model. A finding must show how a less-privileged attacker obtains or abuses that power; “an admin can read/change data” alone is not a product vulnerability. |
| Compromised client device | Browser extensions, malware, devtools, screenshots, or a user who deliberately exports its own session/data. | Anything already available to that user/device. | This is an already-compromised endpoint. It does not excuse a remotely reachable XSS, credential leak, or cross-account authorization failure in LandingOS itself. |

## Trust boundaries and attacker-controlled entry points

### Internet to User Application

- Public pages and SSR receive URLs, route/search state, and browser headers.
- `/api/auth/*` is handled by Better Auth with Email OTP and Bearer plugins. Repository settings are
  six digits, five-minute expiry, three verification attempts, hashed OTP storage, resend rotation,
  database-backed rate limiting, and Turnstile on OTP send; see
  `packages/data-ops/src/auth/setup.ts`.
- `PATCH /api/profile` requires a server-resolved session and can change only the caller's pseudonym
  or separate marketing consent. `DELETE /api/account` forwards to Better Auth deletion, requires
  the exact confirmation string, and relies on Better Auth's five-minute `freshAge`.
- `/api/health` is intentionally public and returns coarse service/environment/readiness data.
- Browser `sessionStorage` holds only a validated funnel ID, room intent containing
  `flightInstanceId` plus coarse public selection, and the traveler's own drop-off label
  with the planner's allowlisted navigation link (`analytics-funnel.ts`, `room-intent.ts`,
  `private-drop-off.ts`). These values are not credentials; the navigation link embeds the
  traveler's own destination coordinates, stays browser-local, and never enters room
  payloads. Place IDs remain component/request state.
- Responses receive `applySecurityHeaders`. Its CSP currently permits `'unsafe-inline'` and
  `'unsafe-eval'`; it is a restriction, not a guarantee that XSS is impossible.

### Internet/browser to Data Service

The Data Service is a public Worker on its own origin. CORS limits which browsers may read/send
credentialed cross-origin requests, but CORS is not authentication and does not constrain
non-browser clients.

| Surface | Expected caller and security-sensitive effect |
|---|---|
| `GET /health/live`, `GET /health/ready` | Anonymous; coarse liveness, environment, service name, and database connectivity only. |
| `POST /flights/resolve` | Anonymous; validates input, passes Turnstile outside dev, may call a flight provider, persists a normalized canonical flight, and starts analytics. |
| `POST /flights/manual` | Anonymous and currently not independently captcha-gated; persists a BGY manual flight instance from bounded input and starts analytics. Flight IDs are not authorization secrets. |
| `POST /destinations/autocomplete`, `/destinations/select` | Anonymous; sends query/place input to the configured Places adapter and returns a whitelisted private planner response. Selection enforces the configured Milan rectangle. |
| `POST /journeys/recommend` | Anonymous; sends exact coordinates and departure time to the configured Transit adapter, reads fresh published catalog rows, and records coarse analytics. |
| `GET /clients`, `GET /clients/:id` | Currently anonymous and return the mounted starter `clients` schema, including email. This is a real reachable code surface in `app.ts`, despite product docs saying the example should be replaced. See Open Questions. |
| `POST/PUT/DELETE /clients...` | Any valid Better Auth session or exact shared `API_TOKEN`, plus rate limit. This is not operator-only. |
| `/rooms/*` REST | Valid Better Auth cookie/Bearer session; service methods then enforce room membership, close time, rules acceptance for sending, and caller-specific block filtering. |
| `/safety/*` | Valid session. Room membership is rechecked for room-specific actions. Block/report mutations are rate-limited; inputs and returned shapes are bounded. |
| `/operator/catalog/*` | Valid session whose current database role is `operator`; server-side middleware guards every route. Effects are catalog CRUD/publication only. |
| `POST /internal/lifecycle/redact-rooms` | Exact shared `API_TOKEN`; normally called through the User Application's `DATA_SERVICE` service binding during account deletion. It can broadcast redaction events only for a bounded list of room/coordinator pairs. |
| `GET /rooms/:roomId/connect` | WebSocket upgrade authenticated either by a one-time room-bound ticket or a Bearer-backed session, followed by membership and close-time checks. |

`createCorsMiddleware` uses fixed localhost origins in dev and exact `ALLOWED_ORIGINS` outside dev
with credentialed requests. Origin allowlisting must not be credited as authorization for curl,
native, compromised-origin, or server-side callers.

### Data Service to Durable Object

The public Worker resolves membership before constructing internal
`X-LandingOS-Room-*` headers and calling the Durable Object by flight-instance name. Browser clients
do not directly choose these internal headers. Browser sockets normally use a 32-random-byte,
SHA-256-hashed, room-bound, single-use ticket with a 60-second lifetime; see
`apps/data-service/src/room/service.ts` and
`packages/data-ops/src/room/queries.ts::consumeConnectionTicket`.

The Durable Object validates serialized attachments, tags sockets by room, rejects client WebSocket
messages (message creation is REST-only), filters broadcasts supplied with blocked recipient IDs,
and closes sockets at the stored alarm. A ticket in the WebSocket URL is a temporary credential and
must not be logged or reused; its presence in the holder's own URL is intentional.

### Workers and privileged tooling to Postgres

Both Workers construct a Neon connection from `DATABASE_HOST`, `DATABASE_USERNAME`, and
`DATABASE_PASSWORD`. Authorization is therefore enforced in application queries, not database
row-level security. Database credentials, direct SQL access, migrations, seeds, and the operator
role command are privileged administrative boundaries.

Database rows and JSONB are also serialized input: room selections and report evidence are parsed
through their Zod schemas when converted to public/domain types. A malicious database row requires
prior database/write compromise unless an untrusted API can create it.

### Workers to external services

- Aviationstack receives flight number/date and an API key; its current API places the key in the
  provider request query string.
- Google Places receives destination query or place ID, a random browser session token, and the
  Milan viewport. Google Routes receives exact destination coordinates and calculated departure.
- Provider requests use a 10-second abort timeout, status mapping, selected field masks, and
  normalizers. Raw payloads are not returned or intentionally logged.
- Cloudflare Turnstile tokens are sent to siteverify/Better Auth validation. Email Sending receives
  the recipient and generated OTP.
- The browser loads Cloudflare's Turnstile script and iframe from
  `https://challenges.cloudflare.com`; the CSP and `components/auth/turnstile.tsx` intentionally
  trust that code in the page's authentication/flight-lookup flow.

These services and the platform can retain data under their own policies. Repository-level deletion
does not erase provider logs/backups; the privacy notice explicitly records this limitation.

### Build, packages, files, configuration, and updates

Runtime behavior is selected by Wrangler bindings and environment values, not by public
command-line arguments or uploaded files. Maintainer-controlled inputs include `.env*`/`.vars`
files, `wrangler.jsonc`, Drizzle migrations, checked-in fixture JSON/TypeScript, public assets,
`package.json`, `pnpm-lock.yaml`, and GitHub Actions.

`pnpm install --frozen-lockfile` is used in release CI. GitHub Actions can write releases and
dependency-update branches with the permissions in `.github/workflows/`. The repository uses no
runtime plugin marketplace. Findings about packages/actions must identify a selected, reachable
version or workflow path and the credentials/effect available there; hypothetical malicious
packages never selected by this repository are not findings.

The `operator:role:{env}`, database migration/seed/studio, `init-project`, deployment, and
`sync-secrets.sh` commands are privileged local/CI operations. Attacker control of their argv,
environment, source tree, or credential files is not a remote application precondition.

## Security invariants

A demonstrated violation of one or more invariants below is reportable when the valid finding test
also passes.

1. **Credential integrity:** an untrusted party cannot forge, fixate, replay beyond its intended
   lifetime, or obtain another user's OTP, session, Bearer token, fresh-session status, connection
   ticket, or server secret.
2. **Account isolation:** profile, consent, deletion, and auth operations affect only the
   authenticated account. Public and room responses do not disclose email or server-only role.
3. **Room authorization:** room history, membership list, mutations, tickets, and sockets require
   authenticated membership in that exact room. Joining is intentionally self-asserted; access to a
   room never joined is not.
4. **Flight-instance isolation:** room data/events for one canonical flight instance, including its
   date, never cross into another instance.
5. **Planner privacy:** exact destination values never cross from the caller/provider planner path
   into public community payloads, persistence outside the transient provider call, analytics, or
   application logs.
6. **Room lifecycle:** the close boundary denies every read/write/connect path and closes live
   sockets; the first bounded cleanup run after the purge boundary must remove active
   message/evidence content as documented, without an open-report exception.
7. **Safety enforcement:** only room members can block/report room targets; a user's active block
   suppresses the blocked source in both recovered history and new real-time delivery; current rules
   acceptance is required before message creation.
8. **Operator least privilege:** only a current operator can mutate catalog state; user input cannot
   grant the role; operator status alone does not unlock planner, chat, report, identity, or lifecycle
   data.
9. **Output and navigation integrity:** public schemas exclude raw provider/database objects, and
   clickable journey/catalog URLs remain approved HTTPS destinations. User-controlled room/catalog
   text must remain inert text in other users' browsers.
10. **Provider/config separation:** fixture data cannot appear in staging/production, live mode
    cannot be selected implicitly, and provider credentials remain server-only. Malformed or failed
    provider data cannot be presented as a verified route.
11. **Analytics minimization:** only registered coarse fields are stored; user identity is represented
    only by the dedicated HMAC pseudonym, never raw user ID/email, exact destination, or message.
12. **Lifecycle authorization:** account deletion requires the caller's fresh session; internal room
    redaction requires the server token; neither accepts arbitrary unbounded work.
13. **Practical availability:** a low-privilege attacker cannot use a bounded number/cost of requests
    to cause sustained cross-user outage, uncontrolled database growth, email flood, or material
    live-provider billing in the supported staging/production configuration.

## Existing controls and intentional trust transfers

- Trust anchors are Cloudflare's edge/Workers/Durable Objects/TLS, Neon access controls, the pinned
  Better Auth and Web Crypto implementations, Email Sending/Turnstile, explicitly selected live
  providers, the package/build infrastructure, and approved external hosts after the user's click.
  Trust means the repository does not reimplement those systems; it does not mean their compromise
  or misconfiguration is impossible.
- Zod request/public-response schemas, whitelisting functions, database constraints, idempotency
  keys, and query-scoped membership checks reduce malformed input and cross-object confusion. They
  do not replace an end-to-end authorization analysis.
- Better Auth provides OTP/session/Bearer handling. LandingOS configures hashed OTP storage,
  expiry/attempt/resend limits, database rate limits, and hidden custom fields. Exact cookie and
  token defaults still depend on the pinned Better Auth version and deployment configuration.
- Turnstile protects OTP send and automatic flight resolution outside dev. Cloudflare rate-limit
  bindings cover client mutations and safety block/report mutations. There is no general rate limit
  on every planner or room endpoint, so the existence of one limiter must not be generalized.
- Hono CORS, HSTS, frame denial, MIME sniffing protection, permissions policy, and CSP are present.
  CORS is not authentication; CSP includes unsafe script allowances; headers do not prove that
  injection is harmless.
- React normally escapes interpolated room/catalog text. That is relevant to current rendering but
  does not excuse a reachable raw-HTML, DOM, URL, or third-party-script injection path.
- Room access is checked in service/query code, WebSocket tickets are random/hashed/short-lived and
  single-use, and the Durable Object stores only socket attachments/alarm state. Postgres and
  connected clients still receive plaintext chat content.
- External provider results are normalized and public results are rebuilt field-by-field. The
  configured live provider still learns the request fields it needs.
- Catalog external URLs have scheme/credential/host and nested redirect-parameter checks. LandingOS
  intentionally transfers trust after an explicit click; it cannot guarantee an approved host's
  later response, redirect, purchase, or compromise.
- Privacy/leak-scan tests under `scripts/`, component/unit tests, E2E, types, and lint are regression
  controls. A passing grep-style boundary test is not proof against aliases, encoded data, runtime
  logging, infrastructure capture, or a path outside its file list.
- Cloudflare observability is enabled with log sampling `1` and trace sampling `0.01` in both
  Workers. Application code intentionally avoids payload logging in sensitive modules, but actual
  platform capture/retention is an operational trust transfer, not established by those tests.

## Accepted risks, exclusions, and invalid preconditions

The following are not vulnerabilities by themselves:

- Any authenticated email holder can self-assert a known flight and join its room; LandingOS does
  not verify a boarding pass, travel, legal name, or identity.
- Pseudonyms are not verified real identities, and users can lie, coordinate off-platform, post
  personal data, harass, spam, or propose payments in chat. A technical bypass of room isolation,
  blocking, reporting, or inert rendering remains reportable.
- A block is a viewer-side safety boundary, not a mutual ban: it hides the blocked source from the
  blocker but does not expel or silence that source for all other members.
- A room member can copy, photograph, or retain content legitimately displayed before closure.
  LandingOS cannot recall data from another user's device.
- The requesting user receiving its own selected destination, or the configured live provider
  receiving the minimum destination input, is intended. Sending it to a room, analytics, unrelated
  user, catalog/profile persistence, or application log is not.
- Funnel IDs, canonical flight IDs, room IDs, pseudonyms, and coarse transport selections are not
  secrets. Possession of an ID must still not bypass the corresponding session/membership check.
- Provider outage, inaccurate real-world schedules/fares, fewer than three routes, unsupported
  destinations, and controlled `manual_required`/`no_trustworthy_route` results are product
  reliability/correctness outcomes unless they produce a concrete protected-data, authorization,
  safety, or material billing/availability impact.
- User action after an explicit click on an approved external host, including payment there, is
  outside LandingOS. A bypass that emits an unapproved/unsafe URL is in scope.
- Absence of end-to-end encryption, offline mode, a service worker, private messaging, automatic
  moderation, payment security, native-app hardening, or a formal SLA is an explicit non-goal.
- Fixture-mode anti-abuse weakness, fake emails/auth, synthetic data, and mock stores are
  development-only. Fixture data reaching staging/production would violate an invariant.
- An attacker who already controls source, a release token, Cloudflare/Neon/DNS/email/provider admin,
  runtime environment variables, the user's device, or direct database credentials is already
  across a trusted boundary. A report must show how a less-privileged attacker gets there.
- Deliberately malicious local CLI arguments, env files, migrations, seed data, checked-in fixtures,
  or installed source/plugins are invalid preconditions unless a supported untrusted input can
  control them without prior compromise.
- A platform/runtime/dependency vulnerability with no affected reachable version/path in this
  repository belongs upstream. A pinned reachable vulnerable version or unsafe workflow
  composition can be project-relevant.
- Merely missing a defense-in-depth control (rate limit, CSP directive, extra validation, key
  rotation, audit log) is hardening-only until a realistic supported path violates an invariant.

## Severity contract

Severity is based on the least privilege actually required, reproducibility in a supported/default
configuration, affected population, persistence, user interaction, and demonstrated impact.
Chaining is allowed only when every link is reachable under the same realistic preconditions.

| Class | LandingOS-specific threshold and examples |
|---|---|
| Critical | Anonymous or ordinary-user compromise of the whole service or a broad share of users with little/no interaction: Worker/CI code execution that yields production secrets/deployment control; practical Better Auth secret/session forgery affecting arbitrary accounts; mass extraction of email plus private room/report data; or a systemic isolation failure exposing many rooms. “Could become RCE if Cloudflare/runtime is compromised” is not Critical. |
| High | Concrete cross-account or privileged compromise with substantial scope: reusable credential theft; non-operator catalog control that can persistently affect travelers; persistent script execution on the LandingOS origin against many users or an operator; access to another room's private history/socket; material email/provider billing abuse or sustained service outage achievable remotely at practical cost. Scope, interaction, and rate limits may lower this. |
| Medium | Limited but real confidentiality/integrity/authorization impact: one or a small set of accounts/rooms exposed under realistic conditions; CSRF or object-authorization failure causing meaningful state change; limited safety-control bypass; short-lived credential exposure that is usable in practice; localized repeatable outage or billing impact. |
| Low | Small, bounded impact with meaningful security relevance: minor non-sensitive metadata disclosure, low-value action requiring strong victim interaction, or a limited abuse-control bypass with demonstrated but modest effect. IDs and documented health metadata alone generally do not qualify. |
| Hardening-only | No demonstrated invariant violation: permissive header, missing generic rate limit, non-ideal action pinning, secret-rotation suggestion, verbose internal error visible only to its caller, or hypothetical issue blocked by another enforced boundary. Track as engineering improvement, not vulnerability severity. |
| Reliability-only | UI/auth navigation failure without unauthorized access; provider timeout or incorrect route/fare; stale display; ordinary bounded cron scheduling delay that does not extend access; single-request crash/error; test-only failure; or performance degradation without sustained cross-user availability/resource impact. Unbounded retention contrary to the lifecycle contract is not automatically reliability-only. |
| Not a security issue | Intended public planner behavior, self-asserted flight membership, user-provided chat abuse without a technical boundary bypass, approved external navigation after explicit click, administrator power, already-compromised source/config/device/database, unsupported deployment changes, or a theoretical upstream issue with no reachable affected path. |

Do not inherit a severity label from `findings/`, an issue title, a scanner, CVSS worst case, or the
importance of the affected feature. For example, a bug that blocks the entire room workflow can be
Critical to product usability yet still be reliability-only for this security contract.

## Valid finding test

Accept a candidate only if all answers are supported by evidence:

1. **Capability:** What exact inputs, account state, credentials, and user interaction does the
   least-privileged attacker control?
2. **Reachability:** Which mounted route, protocol, build/update path, provider response, or
   privileged operation carries that input to the effect?
3. **Supported state:** Does it reproduce in the normal dev contract where relevant or the intended
   staging/production configuration, without malicious local config/source or prior admin/device/DB
   compromise?
4. **Invariant:** Which numbered invariant or protected property is violated? “Best practice is
   missing” is insufficient.
5. **Impact:** What data, account, room, safety control, catalog state, secret, billable resource, or
   cross-user availability is concretely affected, and at what scale/duration?
6. **Exclusions:** Is the behavior an explicit trust transfer, non-goal, self-asserted membership
   risk, public identifier, provider limitation, or already-compromised precondition?
7. **Severity:** After all preconditions and existing controls, does the demonstrated impact meet the
   project-specific class above?

Reject or reclassify a candidate when any answer relies on assumed production presence, an
unmounted example, a malicious maintainer value, impossible cookie/header control, test fixtures,
future features, scanner output without a path, or theoretical worst-case impact. If repository
evidence cannot decide a material premise, keep the candidate conditional and resolve the matching
open question rather than guessing.

## Open questions requiring maintainer confirmation

1. **Mounted starter `/clients` surface:** `apps/data-service/src/hono/app.ts` mounts it in every
   environment; anonymous GET responses include name, surname, and `clients.email`, while mutations
   accept any valid session or the shared token. `AGENTS.md` says the client domain is a starter
   example to replace. Is it intentionally supported, guaranteed empty, or meant to be removed, and
   what access policy is intended if retained? Until resolved, reviewers must treat it as reachable
   and cannot dismiss disclosure solely as dead example code.
2. **Shared API token versus `VITE_API_TOKEN`:** README/init instructions say
   `VITE_API_TOKEN`, `DATA_SERVICE_API_TOKEN`, and `API_TOKEN` should match, but current browser code
   does not use `VITE_API_TOKEN` and `api-token-not-in-bundle.test.ts` asserts canaries are absent.
   Because `VITE_*` is public build configuration, is this legacy documentation, or is the shared
   lifecycle/client-mutation credential intended to be browser-known? The server token's
   confidentiality and authority need one unambiguous contract.
3. **Cross-subdomain auth operations:** both Workers optionally read
   `BETTER_AUTH_COOKIE_DOMAIN`, but it is absent from checked-in examples/generated env types.
   Confirm the production values and expected cookie domain, SameSite/Secure/HttpOnly attributes,
   trusted origins, session lifetime, Bearer-token lifetime/revocation, shared
   `BETTER_AUTH_SECRET`, and `BETTER_AUTH_BASE_URL`. Do not infer them from local E2E mocks.
4. **Missing production config declarations:** runtime code also reads
   `TURNSTILE_SECRET_KEY`, `VITE_TURNSTILE_SITE_KEY`, and `ANALYTICS_PSEUDONYM_SECRET` beyond what
   all examples/generated types consistently show. Confirm provisioning and drift checks for both
   Workers; current code often fails closed, but operational status is not repository evidence.
5. **Journey endpoint corridor binding:** `/destinations/select` enforces
   `milan-municipality-v1`, but `JourneyRecommendationRequestSchema` accepts arbitrary world
   coordinates and `recommendJourneys` does not independently recheck the viewport or bind
   `flightInstanceId`/`scheduledArrivalUtc` to the persisted flight. Is the API itself required to
   enforce those product constraints? A report should distinguish correctness from concrete
   provider-billing/privacy impact until confirmed.
6. **Pseudonym collision semantics:** pseudonyms are bounded but not unique. Member-target
   block/report queries select by pseudonym, whereas message reports bind to a message/membership.
   Confirm whether room-local uniqueness or deterministic handling of duplicate pseudonyms is a
   promised safety property.
7. **Report moderation:** reports and evidence are persisted, but no moderator/report-reading API or
   distinct moderator role is present; product docs say `operator` does not receive chat access.
   Who, if anyone, is authorized to review reports, and through which supported boundary?
8. **Infrastructure retention and encryption:** provider logs, Cloudflare observability/security
   logs, Neon backups, email delivery logs, and infrastructure encryption/retention are not
   controlled or evidenced here. These must be confirmed before the privacy/compliance gate can
   close; do not claim active-database purge erases them.
9. **Availability and billing budgets:** no formal request, email, database-growth, provider-cost, or
   service-availability threshold is documented. A DoS/cost finding must currently demonstrate
   practical material impact; maintainers should define quantitative thresholds if they want
   deterministic severity decisions.
10. **Production release state:** provider measurement/licensing and independent compliance
    approval remain pending. Confirm when that status changes and whether production data/users
    exist; until then, describe production findings as affecting the intended deployment path, not
    as evidence of an already-running pilot.
