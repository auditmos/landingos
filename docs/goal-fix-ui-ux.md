Audit the LandingOS repository in this workspace to find exactly one previously unreported, critical UI/UX issue that materially blocks, misleads, or endangers a traveler during a normal mobile/PWA journey-planning or flight-room workflow.

  Treat `docs/landingos-mvp.md` as the canonical product specification and read the relevant package instructions and GitHub delivery issues
  before evaluating behavior. First build a concise model of the primary user: a Polish-speaking solo or budget traveler flying from Poland to
  Milan-Bergamo (BGY), planning onward travel to a private Milan address and optionally coordinating with people on the same flight. Map the main
  user journey and trust boundaries between the TanStack Start frontend, Hono API, authentication, provider data, journey recommendations,
  private planner state, and shared flight room.

  Prioritize traveler-facing paths involving:
  - mobile onboarding and email OTP authentication;
  - flight number/date entry and manual-resolution fallbacks;
  - Milan destination search, validation, and privacy expectations;
  - presentation and comparison of up to three journey variants;
  - loading, empty, offline, expired, delayed, and provider-error states;
  - external purchase, taxi, and navigation links;
  - joining and using the temporary flight room;
  - pseudonyms, transport selection, messages, blocking, reporting, and community-rules acceptance;
  - WebSocket reconnection and stale or duplicated state;
  - Polish copy, accessibility, responsive layout, touch interaction, navigation, and recovery from errors.

  Evaluate only behavior reachable through realistic normal use with the default fixture configuration or legitimate API/provider responses.
  Preserve the product constraints: destination is Milan only, exact destination data must remain private, no payment or ticketing occurs inside
  LandingOS, fixture data must not represent production readiness, and all user-facing copy must be Polish. Do not assume modified source code,
  manipulated environment variables, privileged operator access, compromised credentials, unsupported configuration, or prior code execution.
  Reject purely cosmetic preferences, speculative inconveniences, and findings that require unusual or out-of-scope behavior.

  Before accepting a candidate, search the repository’s existing findings, tests, documentation, and current open GitHub issues and pull requests
  for duplicates. Reproduce the issue through the actual traveler-facing interface, using browser automation when applicable. Produce minimal but
  conclusive evidence containing:
  - the affected user and workflow;
  - exact reproduction steps and preconditions;
  - screenshots or other relevant artifacts;
  - expected versus actual behavior;
  - concrete traveler impact and why severity is critical;
  - the responsible frontend/API code path and likely root cause;
  - a focused remediation proposal;
  - regression-testable acceptance criteria.

  Prefer one root-cause issue over several related symptoms. Do not modify product code while auditing. Stop after confirming exactly one valid,
  previously unreported critical issue. Write the finding under `./findings/` using the repository’s existing naming and formatting conventions.