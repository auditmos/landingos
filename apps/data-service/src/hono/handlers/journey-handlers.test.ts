import type {
	JourneyRecommendationRequest,
	JourneyRecommendationResult,
} from "@repo/data-ops/journey";
import { createJourneyHandlers, type JourneyHandlerOperations } from "./journey-handlers";

const request: JourneyRecommendationRequest = {
	flightInstanceId: "flight-id",
	scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
	privateDestinationCoordinates: { latitude: 45.464098, longitude: 9.191926 },
	bufferMinutes: 45,
};

const recommendations: JourneyRecommendationResult = {
	status: "recommendations",
	explanation: "Znaleźliśmy tylko jedną unikalną i wiarygodną trasę.",
	variants: [
		{
			id: "journey-1",
			badges: ["recommended", "fastest", "simplest"],
			durationMinutes: 65,
			arrivalTimeUtc: "2026-09-14T10:10:00.000Z",
			cost: {
				currency: "EUR",
				minorMin: 1_000,
				minorMax: 1_200,
				completeness: "partial",
			},
			transferCount: 0,
			walkingMinutes: 8,
			walkingMeters: 600,
			steps: [
				{
					mode: "bus",
					from: "Aeroporto BGY",
					to: "Milano Centrale",
					durationMinutes: 50,
					walkingMeters: 0,
				},
			],
			sourceReferences: [
				{
					kind: "catalog",
					label: "Airport Bus Express",
					url: "https://www.milanbergamoairport.it/en/bus/",
					checkedAt: "2026-07-27T00:00:00.000Z",
				},
			],
			manualVerification: {
				checkedAt: "2026-07-27T00:00:00.000Z",
				freshness: "fresh",
			},
			externalLinks: [
				{
					kind: "purchase",
					label: "Sprawdź u Airport Bus Express",
					url: "https://www.airportbusexpress.it/tickets",
				},
			],
		},
	],
};

function operations(overrides: Partial<JourneyHandlerOperations> = {}): JourneyHandlerOperations {
	return {
		recommend: vi.fn(async () => recommendations),
		...overrides,
	};
}

function post(body: unknown) {
	return new Request("http://localhost/recommend", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("anonymous journey route", () => {
	it("rejects invalid buffer increments before any provider/service call", async () => {
		const service = operations();
		const app = createJourneyHandlers(() => service);
		const response = await app.fetch(post({ ...request, bufferMinutes: 17 }), {} as Env);
		expect(response.status).toBe(400);
		expect(service.recommend).not.toHaveBeenCalled();
		const text = await response.text();
		expect(text).toContain("Bufor można zmieniać co 5 minut.");
	});

	it("works without auth and returns only the normalized private planner contract", async () => {
		const service = operations();
		const app = createJourneyHandlers(() => service);
		const response = await app.fetch(post(request), {} as Env);
		expect(response.status).toBe(200);
		expect(service.recommend).toHaveBeenCalledWith(request);
		expect(await response.json()).toEqual(recommendations);
	});

	it("strips raw provider payload and private destination fields from output", async () => {
		const leaked = {
			...recommendations,
			variants:
				recommendations.status === "recommendations"
					? recommendations.variants.map((variant) => ({
							...variant,
							rawProviderPayload: "raw-secret",
							placeId: "private-place",
							coordinates: request.privateDestinationCoordinates,
						}))
					: [],
		} as JourneyRecommendationResult;
		const app = createJourneyHandlers(() => operations({ recommend: vi.fn(async () => leaked) }));
		const text = await (await app.fetch(post(request), {} as Env)).text();
		expect(text).not.toContain("raw-secret");
		expect(text).not.toContain("private-place");
		expect(text).not.toContain("45.464098");
		expect(JSON.parse(text)).toEqual(recommendations);
	});
});
