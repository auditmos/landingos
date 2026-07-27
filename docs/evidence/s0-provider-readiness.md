# S0 provider readiness evidence

Recorded on 2026-07-27 for issue #2. This report separates deterministic fixture verification from live-provider measurement and production-release decisions.

## Current decision

Production readiness: NOT READY.

No live GO or measured provider-quality claim is recorded. The unresolved gates are:

- live provider measurement;
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

`live_status: not_run_missing_credentials`

The credential-free command test verifies that `pnpm run spike:data` exits exactly 2, emits `external_prerequisite_missing`, and prints no stack trace. Resume with:

```bash
pnpm run spike:data
```

Required server-only variables:

- `LANDINGOS_FLIGHT_PROVIDER`
- `LANDINGOS_PLACES_PROVIDER`
- `LANDINGOS_TRANSIT_PROVIDER`
- `AVIATIONSTACK_ACCESS_KEY`
- `GOOGLE_MAPS_API_KEY`

Because live measurement did not run, live coverage, result quality, call count, p50/p95 latency, billed cost, and provider suitability remain unmeasured. The implemented runner records those fields when explicitly configured; it does not infer cost or GO.

Candidate references for a later measured run:

- Aviationstack documentation and terms: <https://aviationstack.com/documentation>, <https://aviationstack.com/terms>
- Google Places (New): <https://developers.google.com/maps/documentation/places/web-service/place-autocomplete>
- Google Routes transit: <https://developers.google.com/maps/documentation/routes/transit-route>
- Google Maps Platform terms: <https://cloud.google.com/maps-platform/terms>

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
