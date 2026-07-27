import { describe, expect, it } from "vitest";
import {
	JourneyRecommendationRequestSchema,
	JourneyRecommendationResultSchema,
	JourneyVariantSchema,
	TransferCatalogEntrySchema,
} from "./schema";

const request = {
	flightInstanceId: "flight-id",
	scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
	privateDestinationCoordinates: { latitude: 45.464098, longitude: 9.191926 },
};

const variant = {
	id: "journey-1",
	badges: ["recommended", "fastest", "simplest"],
	durationMinutes: 65,
	arrivalTimeUtc: "2026-09-14T10:10:00.000Z",
	cost: {
		currency: "EUR",
		minorMin: 1500,
		minorMax: 1500,
		completeness: "complete",
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
		{
			mode: "walk",
			from: "Duomo M1/M3",
			to: "Duomo di Milano",
			durationMinutes: 8,
			walkingMeters: 600,
		},
	],
	sourceReferences: [
		{
			kind: "provider",
			label: "google_routes_transit",
			url: null,
			checkedAt: null,
		},
	],
	manualVerification: null,
	externalLinks: [],
};

describe("journey contracts", () => {
	it("defaults to 45 minutes and accepts only 15..180 in five-minute increments", () => {
		expect(JourneyRecommendationRequestSchema.parse(request).bufferMinutes).toBe(45);
		for (const bufferMinutes of [15, 20, 45, 175, 180]) {
			expect(
				JourneyRecommendationRequestSchema.safeParse({ ...request, bufferMinutes }).success,
			).toBe(true);
		}
		for (const bufferMinutes of [14, 16, 17, 181, 45.5]) {
			expect(
				JourneyRecommendationRequestSchema.safeParse({ ...request, bufferMinutes }).success,
			).toBe(false);
		}
	});

	it("locks every JourneyVariant field and a maximum of three unique cards", () => {
		expect(JourneyVariantSchema.parse(variant)).toEqual(variant);
		expect(
			JourneyRecommendationResultSchema.safeParse({
				status: "recommendations",
				variants: [variant, { ...variant, id: "journey-2" }, { ...variant, id: "journey-3" }],
				explanation: null,
			}).success,
		).toBe(true);
		expect(
			JourneyRecommendationResultSchema.safeParse({
				status: "recommendations",
				variants: [
					variant,
					{ ...variant, id: "journey-2" },
					{ ...variant, id: "journey-3" },
					{ ...variant, id: "journey-4" },
				],
				explanation: null,
			}).success,
		).toBe(false);
	});

	it("requires all locked transfer-catalog fields without exact traveler destination data", () => {
		const entry = {
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
			checkedAt: "2026-07-27T00:00:00.000Z",
			costMinorMin: 1000,
			costMinorMax: 1200,
			purchaseUrl:
				"https://www.airportbusexpress.it/en-GB/bus-stop-timetable/bergamo-orio-al-serio-milan-central-station",
			publicationStatus: "published",
			provenance: "seeded_fixture",
			createdAt: "2026-07-27T00:00:00.000Z",
			updatedAt: "2026-07-27T00:00:00.000Z",
		};
		expect(TransferCatalogEntrySchema.parse(entry)).toEqual(entry);
		expect(
			TransferCatalogEntrySchema.safeParse({
				...entry,
				costMinorMin: 1_300,
				costMinorMax: 1_200,
			}).success,
		).toBe(false);
		expect(() =>
			TransferCatalogEntrySchema.parse({
				...entry,
				placeId: "private",
				coordinates: { latitude: 45.46, longitude: 9.19 },
			}),
		).toThrow();
	});
});
