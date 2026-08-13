import { describe, expect, it } from "vitest";
import { LIVE_FLIGHT_SAMPLE_V1 } from "../apps/data-service/src/providers/live-flight-sample";
import { executeProviderSpike } from "./provider-spike-command";

function routeResponse(): Response {
	return Response.json({
		routes: [
			{
				duration: "3600s",
				legs: [
					{
						steps: [
							{
								travelMode: "TRANSIT",
								staticDuration: "3600s",
								transitDetails: {
									stopDetails: {
										departureStop: { name: "Aeroporto BGY" },
										arrivalStop: { name: "Milano" },
									},
									transitLine: { vehicle: { type: "BUS" } },
								},
							},
						],
					},
				],
			},
		],
	});
}

function liveFetch(recognizeFlights: boolean) {
	return async (url: string) => {
		if (url.startsWith("https://api.aviationstack.com")) {
			if (!recognizeFlights) return Response.json({ data: [] });
			const parsed = new URL(url);
			const flightNumber = `${parsed.searchParams.get("airline_iata") ?? "FR"}${parsed.searchParams.get("flight_number") ?? "1234"}`;
			const date = parsed.searchParams.get("date") ?? "";
			const sampleCase = LIVE_FLIGHT_SAMPLE_V1.cases.find(
				(item) => item.input.flightNumber === flightNumber && item.input.date === date,
			);
			return Response.json({
				data: [
					{
						flight: {
							number: flightNumber.slice(2),
							iataNumber: flightNumber,
						},
						airline: {
							name: "Measured candidate",
							iataCode: flightNumber.slice(0, 2),
						},
						departure: {
							iataCode: sampleCase?.expected.originIata ?? "WAW",
							scheduledTime: "06:00",
						},
						arrival: {
							iataCode: "BGY",
							scheduledTime: sampleCase?.expected.scheduledArrival.slice(11, 16),
						},
						codeshared: null,
					},
				],
			});
		}
		if (url.endsWith("places:autocomplete")) {
			return Response.json({
				suggestions: [
					{
						placePrediction: {
							placeId: "google:measured",
							structuredFormat: {
								mainText: { text: "Measured place" },
								secondaryText: { text: "Milano, Włochy" },
							},
						},
					},
				],
			});
		}
		return routeResponse();
	};
}

const liveEnv = {
	CLOUDFLARE_ENV: "dev",
	LANDINGOS_FLIGHT_PROVIDER: "aviationstack",
	LANDINGOS_PLACES_PROVIDER: "google_places_new",
	LANDINGOS_TRANSIT_PROVIDER: "google_routes_transit",
	AVIATIONSTACK_ACCESS_KEY: "command-flight-secret",
	GOOGLE_MAPS_API_KEY: "command-google-secret",
};

describe("configured provider spike command", () => {
	it("runs live measurements and emits complete fail-closed evidence", async () => {
		let tick = 0;
		const result = await executeProviderSpike({
			mode: "live",
			env: liveEnv,
			fetchImpl: liveFetch(true),
			nowMs: () => {
				const current = tick;
				tick += 10;
				return current;
			},
			generatedAt: "2026-07-27T12:00:00.000Z",
			onProgress: () => undefined,
			sleep: async () => undefined,
		});

		expect(result.exitCode).toBe(0);
		expect(result.payload).toMatchObject({
			schemaVersion: "s0-provider-readiness-v1",
			live: {
				status: "complete",
				callCount: 25,
				latencyMs: { sampleCount: 25, p50: 10, p95: 10 },
				flightRecognition: { correct: 9, requiredCorrect: 9, status: "passing" },
			},
			productionReadiness: {
				ready: false,
				decision: "not_recorded",
			},
		});
		const serialized = JSON.stringify(result.payload);
		expect(serialized).not.toContain("command-flight-secret");
		expect(serialized).not.toContain("command-google-secret");
	});

	it("exits 1 with actionable evidence when live recognition misses 9/10", async () => {
		const result = await executeProviderSpike({
			mode: "live",
			env: liveEnv,
			fetchImpl: liveFetch(false),
			nowMs: () => 0,
			generatedAt: "2026-08-12T17:00:00.000Z",
			onProgress: () => undefined,
			sleep: async () => undefined,
		});

		expect(result.exitCode).toBe(1);
		expect(result.payload).toMatchObject({
			live: {
				flightRecognition: {
					correct: 0,
					requiredCorrect: 9,
					status: "failing",
					requiredDecision:
						"reconfigure_aviationstack_for_scheduled_flight_coverage_or_replace_provider",
				},
			},
			productionReadiness: {
				ready: false,
				blockers: expect.arrayContaining(["flight_recognition_below_9_of_10"]),
			},
		});
	});
});
