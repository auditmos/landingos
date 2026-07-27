import { DEFAULT_TRANSFER_CATALOG_SEED, type TransferCatalogEntry } from "@repo/data-ops/journey";
import { createDestinationService } from "../destination/service";
import { resolveFlight } from "../flight/resolver";
import { createFixtureProviderAdapters } from "../providers";
import { recommendJourneys } from "./engine";

describe("anonymous fixture journey flow", () => {
	it("composes the actual flight, place, transit, and catalog contracts through an external link", async () => {
		const adapters = createFixtureProviderAdapters();
		const flightResult = await resolveFlight(
			{ flightNumber: "FR1234", departureLocalDate: "2026-09-14" },
			{
				provider: adapters.flight,
				repository: {
					save: vi.fn(async ({ canonicalKey: _canonicalKey, ...flight }) => flight),
				},
			},
		);
		expect(flightResult.status).toBe("recognized");
		if (flightResult.status !== "recognized") return;

		const destinationService = createDestinationService(adapters.places);
		const sessionToken = "anonymous-fixture-session";
		const suggestions = await destinationService.autocomplete({
			query: "Duomo",
			sessionToken,
		});
		expect(suggestions).toMatchObject({
			status: "suggestions",
			predictions: [{ placeId: "fixture:place:duomo" }],
		});
		if (suggestions.status !== "suggestions") return;
		const selection = await destinationService.select({
			placeId: suggestions.predictions[0]?.placeId ?? "",
			sessionToken,
		});
		expect(selection.status).toBe("destination_selected");
		if (selection.status !== "destination_selected") return;

		const seededEntry: TransferCatalogEntry = {
			...(DEFAULT_TRANSFER_CATALOG_SEED[0] as NonNullable<
				(typeof DEFAULT_TRANSFER_CATALOG_SEED)[0]
			>),
			createdAt: "2026-07-27T00:00:00.000Z",
			updatedAt: "2026-07-27T00:00:00.000Z",
		};
		const journeys = await recommendJourneys(
			{
				flightInstanceId: flightResult.flight.id,
				scheduledArrivalUtc: flightResult.flight.scheduledArrivalUtc,
				privateDestinationCoordinates: selection.destination.coordinates,
				bufferMinutes: 45,
			},
			{
				transit: adapters.transit,
				catalog: { listPublished: vi.fn(async () => [seededEntry]) },
				now: () => new Date("2026-07-27T00:00:00.000Z"),
			},
		);

		expect(journeys).toMatchObject({
			status: "recommendations",
			variants: [
				{
					durationMinutes: 65,
					externalLinks: [
						{
							kind: "purchase",
							url: expect.stringMatching(/^https:\/\/www\.airportbusexpress\.it\//),
						},
					],
				},
			],
		});
	});
});
