import { describe, expect, it, vi } from "vitest";
import { LIVE_FLIGHT_SAMPLE_V1 } from "./live-flight-sample";
import { runLiveSpike } from "./live-spike";
import { MILAN_MUNICIPALITY_VIEWPORT } from "./milan-viewport";

function routeResponse(): Response {
	return Response.json({
		routes: [
			{
				duration: "3900s",
				legs: [
					{
						steps: [
							{
								travelMode: "TRANSIT",
								staticDuration: "3000s",
								transitDetails: {
									stopDetails: {
										departureStop: { name: "Aeroporto BGY" },
										arrivalStop: { name: "Milano Centrale" },
									},
									transitLine: { vehicle: { type: "BUS" } },
								},
							},
							{ travelMode: "WALK", staticDuration: "900s", distanceMeters: 1_125 },
						],
					},
				],
			},
		],
	});
}

function liveProviderFetch(failingCases = new Set<string>()) {
	return async (url: string) => {
		if (url.startsWith("https://api.aviationstack.com")) {
			const parsed = new URL(url);
			const flightNumber = `${parsed.searchParams.get("airline_iata") ?? "FR"}${parsed.searchParams.get("flight_number") ?? "1234"}`;
			const date = parsed.searchParams.get("date") ?? "2026-09-14";
			const sampleCase = LIVE_FLIGHT_SAMPLE_V1.cases.find(
				(item) => item.input.flightNumber === flightNumber && item.input.date === date,
			);
			if (sampleCase && failingCases.has(sampleCase.caseId)) return Response.json({ data: [] });
			return Response.json({
				data: [
					{
						flight: {
							number: flightNumber.slice(2),
							iataNumber: flightNumber,
						},
						airline: {
							name: "Fixture Live Candidate",
							iataCode: flightNumber.slice(0, 2),
						},
						departure: {
							iataCode: sampleCase?.expected.originIata ?? "WAW",
							scheduledTime: "06:00",
						},
						arrival: {
							iataCode: "BGY",
							scheduledTime: sampleCase?.expected.scheduledArrival.slice(11, 16) ?? "10:20",
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
							placeId: "google:measured-place",
							structuredFormat: {
								mainText: { text: "Measured Milan place" },
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

describe("live provider spike", () => {
	it("records complete measured evidence without claiming quality review or GO", async () => {
		let tick = 0;
		const progress: string[] = [];
		const sleep = vi.fn(async (_milliseconds: number) => undefined);
		const evidence = await runLiveSpike({
			credentials: {
				aviationstackAccessKey: "test-flight-key",
				googleMapsApiKey: "test-google-key",
			},
			fetchImpl: liveProviderFetch(),
			nowMs: () => {
				const current = tick;
				tick += 5;
				return current;
			},
			generatedAt: "2026-08-12T17:00:00.000Z",
			onProgress: (message) => progress.push(message),
			sleep,
		});

		expect(evidence).toMatchObject({
			status: "complete",
			providers: {
				flight: "aviationstack",
				places: "google_places_new",
				transit: "google_routes_transit",
			},
			coverage: {
				flight: { total: 10, successful: 10 },
				places: { total: 5, successful: 5 },
				transit: { total: 10, successful: 10 },
			},
			resultQuality: {
				status: "unreviewed_against_official_sources",
			},
			flightRecognition: {
				total: 10,
				correct: 9,
				requiredCorrect: 9,
				status: "passing",
				requiredDecision: null,
			},
			callCount: 25,
			latencyMs: { sampleCount: 25, p50: 5, p95: 5 },
			billing: {
				units: {
					aviationstackCalls: 10,
					googlePlacesAutocompleteCalls: 5,
					googleRoutesComputeCalls: 10,
				},
				cost: {
					status: "not_calculated_billing_export_required",
					currency: "USD",
					amount: null,
				},
			},
			viewport: MILAN_MUNICIPALITY_VIEWPORT,
		});
		expect(evidence.sources.length).toBeGreaterThanOrEqual(3);
		expect(evidence.providerTerms.length).toBeGreaterThanOrEqual(3);
		expect(progress).toHaveLength(43);
		expect(sleep).toHaveBeenCalledTimes(18);
		expect(sleep.mock.calls.every(([milliseconds]) => milliseconds === 30_000)).toBe(true);
		expect(progress).toContain("[s0] flight provider wait 2/10 30/60s");
		expect(progress).toContain("[s0] flight provider wait 2/10 60/60s");
		const flightResults = evidence.scenarioResults.filter((item) => item.contract === "flight");
		expect(flightResults).toHaveLength(10);
		expect(flightResults[0]).toMatchObject({
			scenarioId: "flight:w61431:2026-09-01",
			contract: "flight",
			input: { flightNumber: "W61431", date: "2026-09-01" },
			normalizedOutcome: {
				status: "success",
				originIata: "WAW",
				destinationIata: "BGY",
				scheduledArrival: "2026-09-01T08:05:00+02:00",
				timeZone: "Europe/Rome",
			},
			accessedAt: "2026-08-12T17:00:00.000Z",
			correlationId: "flight:w61431:2026-09-01:20260812T170000000Z",
			matchesExpected: true,
		});
		expect(progress[0]).toContain("flight:w61431:2026-09-01:20260812T170000000Z");
		const transitResults = evidence.scenarioResults.filter((item) => item.contract === "transit");
		expect(transitResults).toHaveLength(10);
		expect(transitResults[0]).toMatchObject({
			contract: "transit",
			status: "success",
			firstTransitDepartureStop: "Aeroporto BGY",
			departsFromAirportStop: true,
		});
		expect(evidence.airportDeparture).toEqual({
			origin: { latitude: 45.6656872, longitude: 9.6978308 },
			routesMeasured: 10,
			routesFromAirportStop: 10,
		});
		const serialized = JSON.stringify(evidence);
		expect(serialized).not.toContain("test-flight-key");
		expect(serialized).not.toContain("test-google-key");
		expect(serialized).not.toContain("rawPayload");
	});

	it("fails the 9/10 gate and names the required provider decision", async () => {
		const evidence = await runLiveSpike({
			credentials: {
				aviationstackAccessKey: "test-flight-key",
				googleMapsApiKey: "test-google-key",
			},
			fetchImpl: liveProviderFetch(new Set(["w61431:2026-09-01"])),
			nowMs: () => 0,
			generatedAt: "2026-08-12T17:00:00.000Z",
			onProgress: () => undefined,
			sleep: async () => undefined,
		});

		expect(evidence.flightRecognition).toEqual({
			total: 10,
			correct: 8,
			requiredCorrect: 9,
			status: "failing",
			requiredDecision:
				"reconfigure_aviationstack_for_scheduled_flight_coverage_or_replace_provider",
		});
	});
});
