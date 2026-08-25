import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderResult, TransitProvider, TransitRoute } from "../providers";
import { createJourneyService } from "./service";

const NOW = new Date("2026-09-14T00:00:00.000Z");

const request = {
	flightInstanceId: "flight-id",
	scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
	privateDestinationCoordinates: { latitude: 45.4486, longitude: 9.1736 },
	bufferMinutes: 45,
};

/** Stands in for the published-catalog read; `rows` are raw table rows, as Drizzle returns them. */
function catalogDb(rows: Record<string, unknown>[] = []) {
	const chain = {
		select: () => chain,
		from: () => chain,
		where: () => chain,
		orderBy: async () => rows,
	};
	return chain as unknown as Parameters<typeof createJourneyService>[1];
}

function publishedRow(checkedAt: string): Record<string, unknown> {
	return {
		id: "bgy-airport-bus-centrale",
		operatorName: "Airport Bus Express",
		serviceName: "BGY → Milano Centrale",
		originIata: "BGY",
		destinationStopCode: "milano-centrale",
		destinationStopName: "Milano Centrale",
		durationMinutes: 50,
		transferCount: 0,
		walkingMinutes: 0,
		walkingMeters: 0,
		sourceUrl: "https://www.milanbergamoairport.it/en/bus/",
		checkedAt: new Date(checkedAt),
		costMinorMin: 1_000,
		costMinorMax: 1_200,
		purchaseUrl: "https://www.airportbusexpress.it/tickets",
		publicationStatus: "published",
		provenance: "seeded_fixture",
		createdAt: new Date(checkedAt),
		updatedAt: new Date(checkedAt),
	};
}

function transit(result: ProviderResult<TransitRoute[], TransitRoute>): TransitProvider {
	return { route: vi.fn(async () => result) };
}

describe("journey service diagnostics", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("forwards the diagnostic context so failures carry a category and correlation reference", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const service = createJourneyService(
			transit({
				status: "incomplete_response",
				missingFields: ["routes[1].legs.steps[22].distanceMeters"],
			}),
			catalogDb(),
			{
				diagnostics: { providerClass: "trasa", reference: "cf-ray-journey", exposure: "detailed" },
			},
		);

		const result = await service.recommend(request);

		expect(result.status).toBe("recommendation_unavailable");
		if (result.status !== "recommendation_unavailable") return;
		expect(result.diagnostic).toMatchObject({
			providerClass: "trasa",
			category: "malformed_response",
			reference: "cf-ray-journey",
		});
		expect(warn).toHaveBeenCalledTimes(1);
		const logged = JSON.stringify(warn.mock.calls[0]);
		expect(logged).toContain("cf-ray-journey");
		expect(logged).toContain("routes[1].legs.steps[22].distanceMeters");
		expect(logged).not.toContain("45.4486");
		expect(logged).not.toContain("9.1736");
	});

	// Freshness has one owner: the catalog query decides, the engine renders the verdict.
	// The current policy hides a stale published entry outright; this pins that wiring.
	it.each([
		["fresh", "2026-09-01T00:00:00.000Z", 1],
		["stale", "2026-07-01T00:00:00.000Z", 0],
	] as const)("surfaces a %s published catalog entry as an alternative on provider failure", async (_case, checkedAt, expected) => {
		const service = createJourneyService(
			transit({ status: "timeout", retryable: true }),
			catalogDb([publishedRow(checkedAt)]),
			{ now: () => NOW, freshnessDays: 30 },
		);

		const result = await service.recommend(request);

		expect(result.status).toBe("recommendation_unavailable");
		if (result.status !== "recommendation_unavailable") return;
		expect(result.catalogAlternatives).toHaveLength(expected);
		expect(result.catalogAlternatives[0]?.freshness ?? "fresh").toBe("fresh");
	});

	it("logs nothing when the provider answered without a fault", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const service = createJourneyService(transit({ status: "success", value: [] }), catalogDb(), {
			diagnostics: { providerClass: "trasa", reference: "cf-ray-journey", exposure: "detailed" },
		});

		const result = await service.recommend(request);

		expect(result.status).toBe("no_trustworthy_route");
		expect(warn).not.toHaveBeenCalled();
	});
});
