# Plan: LandingOS MVP — Polska → Mediolan-Bergamo (BGY)

> Source PRD: GitHub issue [#1](https://github.com/auditmos/landingos/issues/1) — "PRD: LandingOS MVP — Polska → Mediolan-Bergamo (BGY)"

## Architectural decisions

Durable decisions that apply across all phases:

- **Architecture style**: Hybrid. Hard external data (flight recognition, transit routing, place lookup) comes from specialized providers hidden behind swappable adapters. All user-owned data (accounts, rooms, messages, transfer catalog) lives in the LandingOS-controlled layer.
- **Stack boundary**: TanStack Start SSR/PWA frontend + Hono API + Better Auth + shared Drizzle/Postgres data layer, all on Cloudflare Workers. This is a fixed technology boundary for the MVP.
- **Client-agnostic API**: The API boundary stays independent of the client. No core logic assumes a browser session; OTP login issues a token a future native client can also consume; the room message-delivery transport (WebSocket/SSE) must be reachable from outside a browser. The admin panel is a thin UI over the same API. Native iOS/Android is deferred, not precluded.
- **Data model / key entities**:
  - **Flight Instance** — canonical identity from carrier + number + date + BGY + scheduled arrival + timezone. Rooms and selections key off this, never off raw user text.
  - **Trip** — flight context + private destination (place id + coordinates) + post-landing buffer. Destination is private planner data.
  - **Journey Variant** — normalized transport option with label (recommended / fastest / simplest), time, cost-or-null with completeness status, transfers, walking segments, ordered steps, source + verification date.
  - **Transfer Catalog Entry** — operator, source, check date, price range, purchase link, freshness state.
  - **User** — email (auth only), pseudonym, operator role flag, marketing-consent flag (default off).
  - **Flight Room** — memberships, per-member transport selection, one shared message stream.
  - **Report**, **Block**, **Analytics Event** (pseudonymous).
- **Integrations**: Flight data via Aviationstack-or-equivalent adapter; routing via Google Routes adapter; place selection via Google Places adapter. Every integration has timeouts, controlled errors, and a provider-swappable adapter. External ticket purchase, taxi, and navigation are explicit external links only — LandingOS processes no payments.
- **Hard rules (cross-cutting, enforced every phase)**:
  - Exact destination (address, place id, coordinates) must never appear in any room API response, system message, or analytics event.
  - Milan-only restriction is **soft-but-explicit and configurable**: autocomplete is scoped to the Milan area; an out-of-bounds destination does not trigger routing and returns a controlled "not supported yet" state.
  - No payments, no boarding-pass verification, no live flight tracking in the MVP.
  - "Cheapest" is never a guaranteed label.
  - Max 500 lines per source file; `pnpm run lint` / `pnpm run types` / `pnpm run test` must exit 0.

---

## Phase 0: Data spike / go-no-go gate

**User stories**: gates the thresholds in US-02 and US-06 (not a product-facing slice)

### What to build

A throwaway measurement harness (not production UI) that exercises the flight-data provider, the routing provider, and a hand-seeded transfer catalog against a representative set of at least 10 real Poland→BGY flights and Milan destinations. Publish coverage, response quality, call count, latency, and cost per full scenario. This is a mandatory measured gate before the full planner (Phases 1-3) is built.

### Acceptance criteria

- [ ] At least 10 representative PL→BGY flights run through the flight-data adapter; recognition rate recorded (target >= 9/10).
- [ ] At least 10 representative BGY→Milan scenarios run through the routing adapter, compared against official carrier sources (target >= 9/10 correct usable result).
- [ ] Cost, call count, and latency of one full flight->destination->variants scenario are measured and written down as go/no-go evidence.
- [ ] Provider commercial/licensing terms confirmed acceptable for the required data.
- [ ] Explicit go/no-go decision recorded; full planner work does not start if thresholds or provider terms fail.

---

## Phase 1: Flight recognition + manual fallback

**User stories**: US-01, US-02, US-03

### What to build

End-to-end slice: a traveler enters a flight number and date, the request runs through the Flight Context Resolver (adapter over the flight-data provider), and the recognized canonical flight context is displayed — carrier, number, date, origin airport, BGY, scheduled arrival in local timezone. When the provider cannot recognize the flight (not_found, timeout, or incomplete response), the UI offers a manual selection of BGY and arrival time without losing any input already entered. No routing yet.

### Acceptance criteria

- [ ] Valid flight number + date triggers the resolver; invalid/missing input shows a field error and does not call the provider.
- [ ] UI displays carrier, number, BGY, and scheduled arrival in local time for a recognized flight.
- [ ] `not_found`, timeout, and incomplete responses each fall back to manual BGY + time selection with no data loss.
- [ ] The resolver returns an explicit "manual selection required" state rather than blocking the planner.
- [ ] Provider is behind a swappable adapter; no live tracking or delay updates.

---

## Phase 2: Destination selection + Milan boundary

**User stories**: US-04, US-31

### What to build

End-to-end slice: a traveler searches for a destination (address, hotel, or place name) via the Places adapter with autocomplete scoped to the Milan administrative area, and selects one unambiguous result carrying an identifier and coordinates. Ambiguous queries surface distinct choices; there is no silent pick of the first match. A point outside the supported (configurable) Milan bounds does not trigger routing and shows a controlled "destination not supported yet" message.

### Acceptance criteria

- [ ] Autocomplete returns Milan-area results; two ambiguous names surface as distinct selectable options.
- [ ] Selected destination carries a stable identifier and coordinates; no silent first-match selection.
- [ ] A destination outside the supported bounds does not call routing and shows the "not supported yet" controlled state.
- [ ] The boundary is a configuration parameter (expandable to more cities without interface changes).
- [ ] Exact destination is held as private planner data (not yet exposed anywhere public).

---

## Phase 3: Journey recommendations + transfer catalog data model

**User stories**: US-05, US-06, US-07, US-08, US-10, US-11, US-24, US-28

### What to build

The core planner slice: arrival context + selected destination + post-landing buffer (default +45 min, adjustable) run through the Journey Recommendation Engine, which merges external routing results with a (seeded) transfer catalog and returns up to three deterministically-labeled variants — recommended, fastest, simplest. Each variant shows time, known cost or explicit "no full price", transfer count, walking segments, and ordered steps, plus completeness status, source, and verification date for manual data. The user can pick a variant (local/ephemeral selection for now) and follow allowlisted external purchase/navigation links. No reliable result yields a controlled no-route state with alternatives, never a fabricated route. Provider faults (timeout, 429, 500, malformed) end the loading state and offer retry or manual fallback. Recommendations are independent of how many people are on the flight. This phase also defines the Transfer Catalog Entry data model and read/merge path (seeded data; admin UI comes in Phase 4).

### Acceptance criteria

- [ ] Default +45 min buffer is applied; changing the buffer recomputes the query and result.
- [ ] At least 9/10 representative scenarios return a correct usable result; labels do not duplicate the same route without explanation.
- [ ] Each variant renders time, known cost or "no price", transfers, walking, and steps in correct order.
- [ ] Completeness status, source, and verification date are always shown for manual/partial-price data.
- [ ] External links go only to allowlisted operators/navigation and never initiate payment in LandingOS.
- [ ] Zero-result / post-arrival / incomplete-data cases produce a controlled message with alternatives, not a generated route.
- [ ] Fault injection (timeout, 429, 500, malformed) per provider ends loading and offers retry or manual fallback.
- [ ] Planner returns identical recommendations regardless of room membership count.
- [ ] Transfer Catalog Entry schema exists with operator, source, check date, price range, link; seeded entries merge into results.

---

## Phase 4: Operator Console (transfer catalog admin)

**User stories**: US-26, US-26a

### What to build

End-to-end slice: an authenticated operator role and an admin panel that performs full CRUD over the BGY transfer catalog (operator, source, check date, price range, purchase link), with freshness validation flagging stale entries. The panel is a thin UI over the same API, restricted to the operator role and enforced server-side. It exposes no exact destinations and no chat content. A regular user attempting access is denied server-side. This gives the product owner self-service maintenance of missing shuttles and prices without developer involvement.

### Acceptance criteria

- [ ] Operator role is enforced server-side; a non-operator user is denied access to the panel and catalog operations.
- [ ] Operator performs full CRUD on catalog entries through the panel.
- [ ] An entry missing any required field cannot be published; freshness validation flags entries needing re-verification.
- [ ] The panel never exposes exact destinations or private chat content.
- [ ] Catalog changes made in the panel are reflected in Phase 3 recommendation merges.

---

## Phase 5: Auth — email OTP + pseudonym + marketing consent

**User stories**: US-12, US-13, US-32

### What to build

End-to-end slice: email one-time-code login via Better Auth (or the project's existing mechanism), issuing a session/token consumable by any client (browser or future native). Rate-limited attempts that never reveal whether an account exists. The user sets a pseudonym validated for length, allowed characters, and non-emptiness; the email is never public. A separate, voluntary marketing-consent opt-in is presented, defaulting to off — logging in never implies marketing consent. This phase is the gateway required before entering a room (the planner in Phases 1-3 stays usable without login).

### Acceptance criteria

- [ ] Only a correct, non-expired code creates a session; attempts are rate-limited and do not reveal account existence.
- [ ] Session/token is client-agnostic (usable by a non-browser client).
- [ ] Pseudonym must satisfy length/character/non-empty rules; email is never exposed publicly.
- [ ] Marketing consent is separate from login, defaults to off, and is recorded independently.
- [ ] Login is required only to enter a room; planner remains usable pre-login.

---

## Phase 6: Flight Room core

**User stories**: US-09, US-14, US-15, US-16, US-17, US-18, US-19

### What to build

The community core slice: after login, a traveler is placed into exactly one room keyed by the canonical flight instance (same number on different days are fully isolated). The room holds memberships, per-member transport selection, and one shared message stream. Members see each other's pseudonym and transport choice — never email or exact destination. Two clients exchange messages in under 5 seconds with no duplicates and no cross-room leakage. A member can declare shared public transport or a shared taxi (no payment/settlement form anywhere). The transport selection is persisted, tied to the correct flight instance, survives refresh, and can be changed with the new choice visible to other clients within 5 seconds. Message-delivery transport is a module detail but must meet visibility, isolation, and latency criteria and be reachable by a non-browser client.

### Acceptance criteria

- [ ] Two users on the same flight instance land in one room; the same flight number on two dates is fully isolated.
- [ ] Member-list response contains pseudonym and transport choice but never email or exact destination.
- [ ] A message appears on a second client within 5 seconds, without duplicates or leakage to another room.
- [ ] Public-transport and shared-taxi declarations are both visible; no payment/settlement form exists on any path.
- [ ] Transport selection persists across refresh, is bound to the correct flight instance, and is restored as the last choice.
- [ ] Changing selection replaces the previous one and is visible to a second client within 5 seconds.

---

## Phase 7: Safety

**User stories**: US-20, US-21, US-30

### What to build

End-to-end safety slice: server-enforced blocking so a blocker no longer receives the blocked user's messages, with refresh and new sessions unable to bypass it. Reporting of a user or a specific message creates a report carrying room id, reporter, target, time, and the necessary message snapshot — with no exact-destination data. Before sending a first message, the user must accept the current version of the community rules; subsequent messages do not re-prompt until the rules version changes.

### Acceptance criteria

- [ ] After a block, the blocked user's messages are not returned to the blocker; refresh and new session do not bypass it.
- [ ] A report is created with room id, reporter, target, time, and a necessary snapshot, and contains no exact-destination data.
- [ ] The first message requires accepting the current community-rules version; later messages do not re-prompt until the version changes.

---

## Phase 8: Lifecycle & privacy

**User stories**: US-22, US-23, US-29

### What to build

End-to-end lifecycle slice with a controlled clock: the room opens on first flight add and becomes inaccessible 24 hours after scheduled landing; messages become unavailable to users at close and are permanently deleted 30 days later. A user can request account deletion, which removes profile and private-destination data, with reported-content retention following the approved policy. Includes an automated privacy leak test confirming email and exact destination never appear in any public payload, system message, or analytics event.

### Acceptance criteria

- [ ] Room is accessible before the boundary and inaccessible from +24h after scheduled landing (tested at +23:59 and +24:00).
- [ ] After close the room disappears from the UI; 30 days later messages and their content no longer exist in active storage.
- [ ] Account deletion removes profile and private-destination data; reported-content handling matches the approved retention policy.
- [ ] Automated privacy test confirms no email and no exact destination in any public API payload, system message, or analytics event.

---

## Phase 9: Analytics

**User stories**: US-27

### What to build

A single instrumentation/verification slice covering the whole funnel: flight recognition, route generation, transport selection, room entry, and chat activity, plus the abandoned path. Each event fires exactly once, uses a pseudonymous id, and contains no email, address, or message content.

### Acceptance criteria

- [ ] Every funnel event fires exactly once on both the full and abandoned paths.
- [ ] Every event uses a pseudonymous id and contains no email, address, or message content.
- [ ] Events cover recognition, route generation, transport selection, room entry, and chat activity.

---

## Phase 10: PWA / mobile-readiness hardening

**User stories**: US-25 (plus the client-agnostic API decision)

### What to build

Final hardening slice: an end-to-end run of the critical path in mobile and desktop viewports with no horizontal scrolling, a valid installable PWA manifest, and confirmation that the API boundary stayed client-agnostic (token auth consumable by a native client, chat transport reachable outside a browser) so a future native app can reuse the backend without rework.

### Acceptance criteria

- [ ] Critical-path E2E passes in mobile and desktop viewports with no horizontal scrolling.
- [ ] PWA has a valid, installable manifest.
- [ ] Auth token is confirmed usable by a non-browser client; chat transport is confirmed reachable outside a browser.
- [ ] No browser-only assumption blocks a future native client from reusing the API.
