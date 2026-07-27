import { describe, expect, it } from "vitest";
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
							{ travelMode: "WALK", staticDuration: "900s" },
						],
					},
				],
			},
		],
	});
}

describe("live provider spike", () => {
	it("records complete measured evidence without claiming quality review or GO", async () => {
		let tick = 0;
		const progress: string[] = [];
		const evidence = await runLiveSpike({
			credentials: {
				aviationstackAccessKey: "test-flight-key",
				googleMapsApiKey: "test-google-key",
			},
			fetchImpl: async (url) => {
				if (url.startsWith("https://api.aviationstack.com")) {
					const parsed = new URL(url);
					const flightNumber = parsed.searchParams.get("flight_iata") ?? "FR1234";
					return Response.json({
						data: [
							{
								flight: { iata: flightNumber },
								airline: { name: "Fixture Live Candidate" },
								departure: {
									iata: "WAW",
									airport: "Lotnisko Chopina w Warszawie",
								},
								arrival: {
									iata: "BGY",
									airport: "Mediolan-Bergamo",
									scheduled: "2026-09-14T10:20:00+02:00",
									timezone: "Europe/Rome",
								},
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
			},
			nowMs: () => {
				const current = tick;
				tick += 5;
				return current;
			},
			generatedAt: "2026-07-27T12:00:00.000Z",
			onProgress: (message) => progress.push(message),
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
		expect(progress).toHaveLength(25);
		const serialized = JSON.stringify(evidence);
		expect(serialized).not.toContain("test-flight-key");
		expect(serialized).not.toContain("test-google-key");
		expect(serialized).not.toContain("rawPayload");
	});
});
