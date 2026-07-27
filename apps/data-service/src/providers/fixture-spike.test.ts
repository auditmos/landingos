import { describe, expect, it } from "vitest";
import { FLIGHT_FIXTURE_SCENARIOS, ROUTE_FIXTURE_SCENARIOS } from "./fixture-data";
import { runFixtureSpike } from "./fixture-spike";

describe("fixture provider spike", () => {
	it("produces a byte-stable summary when scenario input is reordered", async () => {
		const first = await runFixtureSpike({
			flightScenarios: FLIGHT_FIXTURE_SCENARIOS,
			routeScenarios: ROUTE_FIXTURE_SCENARIOS,
		});
		const reordered = await runFixtureSpike({
			flightScenarios: [...FLIGHT_FIXTURE_SCENARIOS].reverse(),
			routeScenarios: [...ROUTE_FIXTURE_SCENARIOS].reverse(),
		});

		expect(JSON.stringify(reordered)).toBe(JSON.stringify(first));
		expect(first.schemaVersion).toBe("s0-provider-readiness-v1");
		expect(first.mode).toBe("fixture");
		expect(first.datasetLabel).toBe("synthetic_recorded_for_testing");
		expect(first.viewportVersion).toBe("milan-municipality-v1");
		expect(first.contracts.flight.successful).toBeGreaterThanOrEqual(10);
		expect(first.contracts.transit.successful).toBeGreaterThanOrEqual(10);
		expect(first.scenarioResults).toHaveLength(
			FLIGHT_FIXTURE_SCENARIOS.length + ROUTE_FIXTURE_SCENARIOS.length + 3,
		);
		expect(new Set(first.scenarioResults.map((result) => result.scenarioId)).size).toBe(
			first.scenarioResults.length,
		);
	});
});
