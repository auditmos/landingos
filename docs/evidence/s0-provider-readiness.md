# S0 provider readiness evidence

Recorded on 2026-07-27 for issue #2. This report separates deterministic fixture verification from live-provider measurement and production-release decisions.

## Current decision

Production readiness: NOT READY.

No live GO or provider-suitability claim is recorded. The unresolved gates are:

- a passing live flight-provider measurement;
- billing/cost and official-result quality review;
- commercial and licensing acceptance by a person with billing authority;
- independent privacy/compliance approval before a production pilot.

## Deterministic fixture evidence

The checked-in dataset is labeled `synthetic_recorded_for_testing`; it is not live provider evidence.

`pnpm run spike:data:fixtures` ran twice with exit code 0 on 2026-07-27. The normalized JSON outputs were byte-identical. Each run exercised 37 scenarios:

| Contract | Total | Success | Other typed outcomes |
| --- | ---: | ---: | --- |
| Flight recognition | 17 | 10 | ambiguity, zero result, timeout, 429, 500, incomplete, malformed |
| Place autocomplete/details | 2 | 2 | none in the deterministic place tracer |
| Transit routing | 17 | 10 | ambiguity, zero result, timeout, 429, 500, incomplete, malformed |
| Transfer catalog | 1 | 1 | none |

The route set includes Milano Centrale, Duomo, Navigli, Porta Garibaldi, Milano Cadorna, and a late-evening arrival. The machine-readable result is [`data/s0-provider-fixture-results.json`](./data/s0-provider-fixture-results.json).

## Live measurement status

`live_status: complete_failing`

The latest credentialed `pnpm run spike:data` measurement ran on 2026-08-12 and exited 1. It
made 25 provider calls: 10 flight, 5 place-autocomplete, and 10 transit calls. The flight
runner emitted a heartbeat every 30 seconds while enforcing a 60-second interval between
Aviationstack future-schedule calls.

- Flight recognition: 9/10 normalized successfully and 7/10 correct against the versioned
  Milan Bergamo Airport references.
- Seven flights matched exactly. FR8845 and FR9094 returned different scheduled-arrival
  times, while the overnight FR3505 lookup normalized to `provider_error`.
- Places: 0/5 successful (four `ambiguous`, one `incomplete_response`).
- Transit: 9/10 successful (one `incomplete_response`).
- Cost remains `not_calculated_billing_export_required`.

The adapter diagnosis is conclusive about endpoint compatibility. The prior future-date call
to `/v1/flights` returned HTTP 403; the same credential returned HTTP 200 and one match from
the documented `/v1/flightsFuture` endpoint. The live future response uses
`YYYY-MM-DD HH:mm:ss` local timestamps, while the published schema example uses a time-only
value. The adapter now selects `/v1/flightsFuture` only for future dates, keeps `/v1/flights`
for today/past dates, normalizes both timestamp forms, and filters BGY arrivals by airline and
flight number. The spike pacing follows Aviationstack's documented Free-plan interval.

The 7/10 correctness result remains below the required 9/10 gate. The chosen adapter
reconfiguration fixed endpoint access and normalization, but did not establish provider data
quality for this corridor. The required decision therefore remains
`reconfigure_aviationstack_for_scheduled_flight_coverage_or_replace_provider`.

The sanitized per-flight evidence is
[`data/issue16-live-flight-results.json`](./data/issue16-live-flight-results.json). It contains
no raw provider payloads or credentials. Provider suitability remains failing, the broader
official-result-quality review remains unresolved, and the measurement does not imply production GO.

Candidate references for a later measured run:

- Aviationstack OpenAPI, FAQ, pricing, and terms: <https://api.swaggerhub.com/apis/apilayer-863/AviationstackAPI/1.0.0/swagger.json>, <https://aviationstack.com/faq>, <https://aviationstack.com/pricing>, <https://aviationstack.com/terms>
- Google Places (New): <https://developers.google.com/maps/documentation/places/web-service/place-autocomplete>
- Google Routes transit: <https://developers.google.com/maps/documentation/routes/transit-route>
- Google Maps Platform terms: <https://cloud.google.com/maps-platform/terms>

## Issue #16 remediation evidence

Recorded on 2026-08-12. The credentialed live gate was measured and is failing; no
provider suitability or production-readiness claim is inferred from fixture data.

| Acceptance criterion | Status | Evidence |
| --- | --- | --- |
| Manual fallback starts without an arbitrary arrival time and requires traveler confirmation | verified | The component test asserts an empty native time input, a disabled confirmation action, no `12:00`, and the traveler-entered UTC value in `POST /flights/manual`. |
| All five fallback reasons are distinct, actionable, and Polish | verified | The table-driven component test covers `not_found`, `provider_timeout`, `rate_limited`, `provider_error`, and `incomplete_result`, while preserving the submitted flight number and date. |
| A versioned sample contains at least 10 current scheduled direct Poland-to-BGY flights, including W61431, with per-call live evidence | verified | [`live-flight-sample.ts`](../../apps/data-service/src/providers/live-flight-sample.ts) contains exactly 10 cases and source metadata. The sanitized [live result](./data/issue16-live-flight-results.json) records every input, normalized outcome, access time, correlation ID, and match result. |
| At least 9 of 10 sample flights are recognized correctly by the real live provider | failing | After the endpoint adapter fix, 9/10 normalized successfully but only 7/10 matched the airport references. FR8845 and FR9094 had arrival-time mismatches; overnight FR3505 returned `provider_error`. The runner exited 1 and records `reconfigure_aviationstack_for_scheduled_flight_coverage_or_replace_provider`. |
| Five provider faults produce safe typed outcomes with no unhandled exception | verified | Resolver-level fault injection covers timeout/abort, HTTP 429, HTTP 500, incomplete result, and zero result through the real live adapter boundary. |
| Fixture mode is fail-closed outside local/CI and secrets/raw payloads do not leak | verified | Environment-matrix tests cover explicit and implicit fixture rejection in staging/production; response, source, raw-payload, and production-browser-bundle scans pass. |
| Required repository verification | verified | `pnpm run types` exited 0. The full suite exited 0 with 120 files and 690 tests passed (one file and two tests skipped by their normal-suite conditions). Biome checked 384 files; the provider security scan passed 3/3 tests; the opt-in production bundle scan passed 2/2 tests. |

The scheduled sample uses the official Milan Bergamo Airport September 2026 arrival
timetables for [Warsaw](https://www.milanbergamoairport.it/en/seasonal-flights-timetable/calendar/linea/arr/WAW/?m=09&y=2026),
[Krakow](https://www.milanbergamoairport.it/en/seasonal-flights-timetable/calendar/linea/arr/KRK/?m=09&y=2026),
[Wroclaw](https://www.milanbergamoairport.it/en/seasonal-flights-timetable/calendar/linea/arr/WRO/?m=09&y=2026),
and [Gdansk](https://www.milanbergamoairport.it/en/seasonal-flights-timetable/calendar/linea/arr/GDN/?m=09&y=2026),
accessed at `2026-08-12T16:26:56.000Z`. For every credentialed flight call, the runner
emits a line-delimited progress heartbeat on stderr and records the input, normalized outcome, access time,
correlation ID, reference expectation, and match result in the evidence JSON.

## Issue #24 route-origin evidence

Recorded on 2026-08-22. This is a **manual probe** (3 credentialed Google Routes calls plus one
Places text search from a local key), not a `pnpm run spike:data` run. It changes no
production-readiness decision.

| Origin sent to Google Routes | BGY → Milano Centrale result (6 routes) |
| --- | --- |
| Aerodrome reference point `45.6739, 9.7042` (previous constant) | 5/6 routes start at Seriate stops ("Seriate Roma 74b", "Seriate Italia fr.51", "Lunga Fiera"); 111–147 min; 19–35 steps; no fare. The direct airport bus appears once, as alternative #4, preceded by a detour bus. |
| Arrivals bus station `45.6656872, 9.6978308` (new `BGY_ROUTE_ORIGIN`) | 5/6 routes are "Bergamo Airport Bus Station → Milan Centrale Piazza Luigi di Savoia"; 57 min; 9–11 steps; fare EUR 9.50–10.00 present. The sixth departs from "Aeroporto Il Caravaggio" (75 min via Bergamo rail). **6/6 routes depart from an airport stop.** |

Origin provenance: Google Places text search for "Bergamo Airport Bus Station" returned place
type `bus_station` at the coordinate above (checked 2026-08-22; see
[`bgy-origin.ts`](../../apps/data-service/src/providers/bgy-origin.ts)).

The live spike now records, per transit scenario, `firstTransitDepartureStop` and
`departsFromAirportStop`, and an aggregate `airportDeparture.routesFromAirportStop /
routesMeasured`. No spike run with these fields has been executed yet; the numbers above come
from the manual probe only.

## Milan municipality viewport

Both fixture and live Places adapters consume the exact rectangle `milan-municipality-v1`:

- low latitude: `45.38672482115768`
- low longitude: `9.040613060914325`
- high latitude: `45.53594676003435`
- high longitude: `9.277997093231479`

It was derived by taking the minimum and maximum WGS84 coordinates across 19,553 points in the Comune di Milano GeoJSON resource. Source accessed 2026-07-27:

- dataset: <https://dati.comune.milano.it/dataset/ds2841-confini-amministrativi-del-comune-di-milano>
- exact GeoJSON resource: <https://dati.comune.milano.it/dataset/e75d91fa-eca6-4ee5-b96e-08bcdbb8d6f0/resource/f56cb432-83e6-48de-ae30-d39b4be61e85/download/confine_comune_milano_layer_0_confine_comune_milano.geojson>

## Fail-closed and privacy checks

- Fixture mode is the local/CI default, but explicit fixture mode is rejected in staging and production.
- Staging and production do not infer live mode; selected live providers, credentials, and a recorded GO are required.
- Provider credentials exist only in server configuration examples and live adapter construction.
- Evidence and fixture summaries contain normalized statuses and IDs, never raw provider payloads or credentials.
- No exact private traveler destination is recorded in live scenario evidence, logs, or the fixture summary.
