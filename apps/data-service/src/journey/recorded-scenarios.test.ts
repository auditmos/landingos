import type { JourneyRecommendationRequest } from "@repo/data-ops/journey";
import {
	createFixtureProviderAdapters,
	ROUTE_FIXTURE_SCENARIOS,
	type RouteFixtureScenario,
} from "../providers";
import { recommendJourneys } from "./engine";

type SuccessfulRouteScenario = RouteFixtureScenario & {
	result: Extract<RouteFixtureScenario["result"], { status: "success" }>;
};

describe("recorded S0 journey scenarios", () => {
	it("keeps at least 9/10 representative expected routes usable", async () => {
		const scenarios = ROUTE_FIXTURE_SCENARIOS.filter(
			(scenario): scenario is SuccessfulRouteScenario => scenario.result.status === "success",
		);
		expect(scenarios).toHaveLength(10);
		const adapters = createFixtureProviderAdapters();
		let usable = 0;
		for (const scenario of scenarios) {
			const scheduledArrivalUtc = new Date(
				new Date(scenario.input.departureTime).getTime() - 45 * 60_000,
			).toISOString();
			const request: JourneyRecommendationRequest = {
				flightInstanceId: `flight:${scenario.scenarioId}`,
				scheduledArrivalUtc,
				privateDestinationCoordinates: scenario.input.destination,
				bufferMinutes: 45,
			};
			const result = await recommendJourneys(request, {
				transit: adapters.transit,
				catalog: { listPublished: vi.fn(async () => []) },
				now: () => new Date("2026-07-27T00:00:00.000Z"),
			});
			if (result.status === "recommendations") {
				usable += 1;
				expect(result.variants[0]).toMatchObject({
					durationMinutes: scenario.result.value[0]?.durationMinutes,
					transferCount: scenario.result.value[0]?.transfers,
					walkingMinutes: scenario.result.value[0]?.walkingMinutes,
					walkingMeters: scenario.result.value[0]?.walkingMeters,
				});
			}
		}
		expect(usable).toBeGreaterThanOrEqual(9);
	});
});
