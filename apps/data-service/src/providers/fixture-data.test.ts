import { describe, expect, it } from "vitest";
import { FLIGHT_FIXTURE_SCENARIOS, ROUTE_FIXTURE_SCENARIOS } from "./fixture-data";

describe("provider fixture datasets", () => {
	it("contains ten varied PL to BGY flights plus every locked outcome", () => {
		const successes = FLIGHT_FIXTURE_SCENARIOS.filter(
			(scenario) => scenario.result.status === "success",
		);
		const statuses = new Set(FLIGHT_FIXTURE_SCENARIOS.map((scenario) => scenario.result.status));

		expect(successes.length).toBeGreaterThanOrEqual(10);
		expect(
			new Set(
				successes.map((scenario) =>
					scenario.result.status === "success" ? scenario.result.value.origin.iata : "",
				),
			).size,
		).toBeGreaterThanOrEqual(8);
		expect(new Set(successes.map((scenario) => scenario.input.date)).size).toBeGreaterThanOrEqual(
			10,
		);
		expect(
			new Set(
				successes.map((scenario) =>
					scenario.result.status === "success"
						? scenario.result.value.scheduledArrival.slice(11, 16)
						: "",
				),
			).size,
		).toBeGreaterThanOrEqual(8);
		expect(statuses).toEqual(
			new Set([
				"success",
				"ambiguous",
				"zero_result",
				"timeout",
				"rate_limited",
				"provider_error",
				"incomplete_response",
				"malformed_response",
			]),
		);
		expect(
			FLIGHT_FIXTURE_SCENARIOS.every(
				(scenario) => scenario.provenance === "synthetic_recorded_for_testing",
			),
		).toBe(true);
	});

	it("contains ten BGY to Milan routes, named destinations, late evening, and every locked outcome", () => {
		const successes = ROUTE_FIXTURE_SCENARIOS.filter(
			(scenario) => scenario.result.status === "success",
		);
		const destinationLabels = new Set(successes.map((scenario) => scenario.destinationLabel));
		const statuses = new Set(ROUTE_FIXTURE_SCENARIOS.map((scenario) => scenario.result.status));

		expect(successes.length).toBeGreaterThanOrEqual(10);
		expect(
			["Milano Centrale", "Duomo", "Navigli", "Porta Garibaldi"].every((label) =>
				destinationLabels.has(label),
			),
		).toBe(true);
		expect(
			successes.some((scenario) => Number(scenario.input.departureTime.slice(11, 13)) >= 22),
		).toBe(true);
		expect(statuses).toEqual(
			new Set([
				"success",
				"ambiguous",
				"zero_result",
				"timeout",
				"rate_limited",
				"provider_error",
				"incomplete_response",
				"malformed_response",
			]),
		);
		expect(
			ROUTE_FIXTURE_SCENARIOS.every(
				(scenario) => scenario.provenance === "synthetic_recorded_for_testing",
			),
		).toBe(true);
	});
});
