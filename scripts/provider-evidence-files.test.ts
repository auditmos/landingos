import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runFixtureSpike } from "../apps/data-service/src/providers/fixture-spike";
import {
	createMissingLiveEvidence,
	serializeProviderEvidence,
} from "../apps/data-service/src/providers/provider-evidence";

const REQUIRED_LIVE_VARIABLES = [
	"LANDINGOS_FLIGHT_PROVIDER",
	"LANDINGOS_PLACES_PROVIDER",
	"LANDINGOS_TRANSIT_PROVIDER",
	"AVIATIONSTACK_ACCESS_KEY",
	"GOOGLE_MAPS_API_KEY",
] as const;

describe("checked-in S0 provider evidence", () => {
	it("matches the deterministic fixture command and records live work as not run", async () => {
		const evidence = JSON.parse(
			readFileSync("docs/evidence/data/s0-provider-fixture-results.json", "utf8"),
		);

		expect(evidence).toMatchObject({
			schemaVersion: "s0-provider-readiness-v1",
			fixture: {
				status: "complete",
				datasetLabel: "synthetic_recorded_for_testing",
			},
			live: {
				status: "not_run_missing_credentials",
				missingVariables: [...REQUIRED_LIVE_VARIABLES],
				resumeCommand: "pnpm run spike:data",
			},
			productionReadiness: {
				ready: false,
				decision: "not_recorded",
			},
		});
		expect(evidence.fixture.summary).toEqual(await runFixtureSpike());
		expect(JSON.stringify(evidence)).not.toMatch(
			/("access_key"|X-Goog-Api-Key|rawPayload|raw_payload)/,
		);
	});

	it("is exactly what the evidence constructors serialize today", async () => {
		const committed = JSON.parse(
			readFileSync("docs/evidence/data/s0-provider-fixture-results.json", "utf8"),
		);
		// `ready` lives only on the wire, derived from `decision` — this pins the
		// committed artifact to the serializer, key order and all, so the
		// derivation can never silently change the recorded readiness claim.
		const rebuilt = serializeProviderEvidence(
			createMissingLiveEvidence(await runFixtureSpike(), committed.generatedOn),
		);

		expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(committed));
	});

	it("documents exact boundary provenance, measured live failure, and unresolved release gates", () => {
		const report = readFileSync("docs/evidence/s0-provider-readiness.md", "utf8");
		const liveFlightEvidence = JSON.parse(
			readFileSync("docs/evidence/data/issue16-live-flight-results.json", "utf8"),
		);

		expect(report).toContain("synthetic_recorded_for_testing");
		expect(report).toContain("complete_failing");
		expect(report).toContain("7/10 correct");
		expect(report).toContain("9/10 normalized successfully");
		expect(report).toContain("/v1/flightsFuture");
		expect(report).toContain("pnpm run spike:data");
		expect(report).toContain("2026-07-27");
		expect(report).toContain("45.38672482115768");
		expect(report).toContain("9.277997093231479");
		expect(report).toContain(
			"https://dati.comune.milano.it/dataset/ds2841-confini-amministrativi-del-comune-di-milano",
		);
		expect(liveFlightEvidence).toMatchObject({
			schemaVersion: "issue16-live-flight-recognition-v1",
			summary: {
				total: 10,
				successful: 9,
				correct: 7,
				requiredCorrect: 9,
				status: "failing",
			},
			normalizedDiagnostic: {
				endpoint: "/v1/flightsFuture",
				httpStatus: 200,
				resultCount: 1,
				timestampMask: "YYYY-MM-DD HH:mm:ss",
			},
		});
		expect(liveFlightEvidence.cases).toHaveLength(10);
		expect(report).toContain("Production readiness: NOT READY");
		expect(report).not.toContain("Production readiness: GO");
	});
});
