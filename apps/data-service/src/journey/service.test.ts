import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderResult, TransitProvider, TransitRoute } from "../providers";
import { createJourneyService } from "./service";

const request = {
	flightInstanceId: "flight-id",
	scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
	privateDestinationCoordinates: { latitude: 45.4486, longitude: 9.1736 },
	bufferMinutes: 45,
};

function emptyCatalogDb() {
	const chain = {
		select: () => chain,
		from: () => chain,
		where: () => chain,
		orderBy: async () => [],
	};
	return chain as unknown as Parameters<typeof createJourneyService>[1];
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
			emptyCatalogDb(),
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

	it("logs nothing when the provider answered without a fault", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const service = createJourneyService(
			transit({ status: "success", value: [] }),
			emptyCatalogDb(),
			{
				diagnostics: { providerClass: "trasa", reference: "cf-ray-journey", exposure: "detailed" },
			},
		);

		const result = await service.recommend(request);

		expect(result.status).toBe("no_trustworthy_route");
		expect(warn).not.toHaveBeenCalled();
	});
});
