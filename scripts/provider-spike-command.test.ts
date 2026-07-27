import { describe, expect, it } from "vitest";
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

describe("configured provider spike command", () => {
	it("runs live measurements and emits complete fail-closed evidence", async () => {
		let tick = 0;
		const result = await executeProviderSpike({
			mode: "live",
			env: {
				CLOUDFLARE_ENV: "dev",
				LANDINGOS_FLIGHT_PROVIDER: "aviationstack",
				LANDINGOS_PLACES_PROVIDER: "google_places_new",
				LANDINGOS_TRANSIT_PROVIDER: "google_routes_transit",
				AVIATIONSTACK_ACCESS_KEY: "command-flight-secret",
				GOOGLE_MAPS_API_KEY: "command-google-secret",
			},
			fetchImpl: async (url) => {
				if (url.startsWith("https://api.aviationstack.com")) {
					const parsed = new URL(url);
					return Response.json({
						data: [
							{
								flight: {
									iata: parsed.searchParams.get("flight_iata") ?? "FR1234",
								},
								airline: { name: "Measured candidate" },
								departure: { iata: "WAW", airport: "Warszawa" },
								arrival: {
									iata: "BGY",
									airport: "Bergamo",
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
			},
			nowMs: () => {
				const current = tick;
				tick += 10;
				return current;
			},
			generatedAt: "2026-07-27T12:00:00.000Z",
			onProgress: () => undefined,
		});

		expect(result.exitCode).toBe(0);
		expect(result.payload).toMatchObject({
			schemaVersion: "s0-provider-readiness-v1",
			live: {
				status: "complete",
				callCount: 25,
				latencyMs: { sampleCount: 25, p50: 10, p95: 10 },
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
});
