import { describe, expect, it } from "vitest";
import { createLiveTransitProvider } from "./live-transit";

describe("live transit provider", () => {
	it("normalizes Google transit routes with an opaque stable ID", async () => {
		const requests: Array<{ url: string; init?: RequestInit }> = [];
		const provider = createLiveTransitProvider(
			{ googleMapsApiKey: "test-google-key" },
			async (url, init) => {
				requests.push({ url, init });
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
													departureStop: {
														name: "Aeroporto BGY",
													},
													arrivalStop: {
														name: "Milano Centrale",
													},
												},
												transitLine: {
													vehicle: { type: "BUS" },
												},
											},
										},
										{
											travelMode: "TRANSIT",
											staticDuration: "420s",
											transitDetails: {
												stopDetails: {
													departureStop: {
														name: "Centrale FS",
													},
													arrivalStop: { name: "Duomo" },
												},
												transitLine: {
													vehicle: { type: "SUBWAY" },
												},
											},
										},
										{
											travelMode: "WALK",
											staticDuration: "480s",
											distanceMeters: 600,
										},
									],
								},
							],
							travelAdvisory: {
								transitFare: {
									currencyCode: "EUR",
									units: "15",
									nanos: 0,
								},
							},
						},
					],
				});
			},
		);
		const input = {
			origin: { latitude: 45.6739, longitude: 9.7042 },
			destination: { latitude: 45.464098, longitude: 9.191926 },
			departureTime: "2026-09-14T11:05:00+02:00",
		};

		const first = await provider.route(input);
		const second = await provider.route(input);

		expect(first.status).toBe("success");
		expect(second).toEqual(first);
		if (first.status === "success") {
			expect(first.value[0]).toMatchObject({
				departureTime: input.departureTime,
				arrivalTime: "2026-09-14T10:10:00.000Z",
				durationMinutes: 65,
				transfers: 1,
				walkingMinutes: 8,
				walkingMeters: 600,
				fare: {
					currency: "EUR",
					amountMinor: 1_500,
					completeness: "complete",
				},
				source: {
					kind: "live",
					label: "google_routes_transit",
				},
			});
			expect(first.value[0]?.id).toMatch(/^google:route:[0-9a-f]{8}$/);
			expect(first.value[0]?.id).not.toContain("45.");
		}
		expect(requests[0]?.url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
		expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
			travelMode: "TRANSIT",
			departureTime: input.departureTime,
		});
	});
});
