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
			origin: { latitude: 45.6656872, longitude: 9.6978308 },
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

const INPUT = {
	origin: { latitude: 45.6656872, longitude: 9.6978308 },
	destination: { latitude: 45.4486, longitude: 9.1736 },
	departureTime: "2026-09-14T11:05:00+02:00",
};

function transitStep(from: string, to: string, seconds: number, vehicle = "BUS") {
	return {
		travelMode: "TRANSIT",
		staticDuration: `${seconds}s`,
		transitDetails: {
			stopDetails: { departureStop: { name: from }, arrivalStop: { name: to } },
			transitLine: { vehicle: { type: vehicle } },
		},
	};
}

function walkStep(seconds: number, distanceMeters?: number) {
	return {
		travelMode: "WALK",
		staticDuration: `${seconds}s`,
		...(distanceMeters === undefined ? {} : { distanceMeters }),
	};
}

function googleRoute(steps: unknown[], extra: Record<string, unknown> = {}) {
	return { duration: "3600s", legs: [{ steps }], ...extra };
}

function providerFor(body: unknown) {
	return createLiveTransitProvider({ googleMapsApiKey: "test-google-key" }, async () =>
		Response.json(body),
	);
}

const AIRPORT_BUS = transitStep(
	"Bergamo Airport Bus Station",
	"Milan Centrale Piazza Luigi di Savoia",
	3000,
);

describe("live transit provider – Google proto3 omissions", () => {
	it("treats a WALK step without distanceMeters as zero metres instead of failing", async () => {
		const result = await providerFor({
			routes: [googleRoute([walkStep(60, 80), AIRPORT_BUS, walkStep(112), walkStep(300, 250)])],
		}).route(INPUT);
		expect(result.status).toBe("success");
		if (result.status !== "success") return;
		expect(result.value[0]).toMatchObject({ walkingMeters: 330, walkingMinutes: 8 });
	});

	it("keeps the valid routes when only one alternative is malformed", async () => {
		const result = await providerFor({
			routes: [
				googleRoute([walkStep(60, 80), AIRPORT_BUS]),
				googleRoute([{ travelMode: "TRANSIT", staticDuration: "900s", transitDetails: {} }]),
				googleRoute([AIRPORT_BUS, walkStep(120, 150)]),
			],
		}).route(INPUT);
		expect(result.status).toBe("success");
		if (result.status !== "success") return;
		expect(result.value).toHaveLength(2);
		expect(result.value.map((route) => route.legs.length)).toEqual([2, 2]);
	});

	it("reports incomplete_response with every missing path only when no route survives", async () => {
		const result = await providerFor({
			routes: [
				googleRoute([{ travelMode: "TRANSIT", staticDuration: "900s", transitDetails: {} }]),
				googleRoute([{ travelMode: "BICYCLE", staticDuration: "900s" }]),
			],
		}).route(INPUT);
		expect(result).toEqual({
			status: "incomplete_response",
			missingFields: [
				"routes[0].legs.steps[0].transitDetails.stopDetails",
				"routes[1].legs.steps[0].travelMode",
			],
		});
	});

	it("normalizes a whole-euro fare that omits nanos as complete", async () => {
		const result = await providerFor({
			routes: [
				googleRoute([AIRPORT_BUS], {
					travelAdvisory: { transitFare: { currencyCode: "EUR", units: "10" } },
				}),
			],
		}).route(INPUT);
		expect(result.status).toBe("success");
		if (result.status !== "success") return;
		expect(result.value[0]?.fare).toEqual({
			currency: "EUR",
			amountMinor: 1_000,
			completeness: "complete",
		});
	});

	it("merges consecutive WALK steps into one leg and keeps transfers from transit legs", async () => {
		const result = await providerFor({
			routes: [
				googleRoute([
					walkStep(30, 40),
					walkStep(45, 60),
					walkStep(15, 20),
					AIRPORT_BUS,
					walkStep(60, 90),
					walkStep(60, 90),
					transitStep("Centrale FS", "Duomo", 420, "SUBWAY"),
					walkStep(120, 150),
				]),
			],
		}).route(INPUT);
		expect(result.status).toBe("success");
		if (result.status !== "success") return;
		const route = result.value[0];
		expect(route?.legs.map((leg) => [leg.mode, leg.durationMinutes, leg.walkingMeters])).toEqual([
			["walk", 2, 120],
			["bus", 50, 0],
			["walk", 2, 180],
			["metro", 7, 0],
			["walk", 2, 150],
		]);
		expect(route).toMatchObject({ transfers: 1, walkingMinutes: 6, walkingMeters: 450 });
	});
});
