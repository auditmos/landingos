import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runFixtureSpike } from "../apps/data-service/src/providers/fixture-spike";

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

	it("documents exact boundary provenance and unresolved release gates", () => {
		const report = readFileSync("docs/evidence/s0-provider-readiness.md", "utf8");

		expect(report).toContain("synthetic_recorded_for_testing");
		expect(report).toContain("not_run_missing_credentials");
		expect(report).toContain("pnpm run spike:data");
		expect(report).toContain("2026-07-27");
		expect(report).toContain("45.38672482115768");
		expect(report).toContain("9.277997093231479");
		expect(report).toContain(
			"https://dati.comune.milano.it/dataset/ds2841-confini-amministrativi-del-comune-di-milano",
		);
		for (const variable of REQUIRED_LIVE_VARIABLES) {
			expect(report).toContain(variable);
		}
		expect(report).toContain("Production readiness: NOT READY");
		expect(report).not.toContain("Production readiness: GO");
	});
});
