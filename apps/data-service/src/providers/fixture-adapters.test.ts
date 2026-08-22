import { describe, expect, it } from "vitest";
import { createFixtureProviderAdapters } from "./fixture-adapters";
import { MILAN_MUNICIPALITY_VIEWPORT } from "./milan-viewport";

/*
 * S0 contract assumptions:
 * - Flight lookup accepts a normalized flight number and ISO calendar date.
 * - Successful output is a provider-neutral discriminated union with a canonical
 *   flight instance; fixture-only provenance is metadata, never user-facing data.
 * - Canonical IDs depend only on normalized flight fields, not fixture ordering.
 * - This tracer bullet intentionally does not cover place, route, catalog, live,
 *   or failure behavior; each follows in its own RED -> GREEN slice.
 */
describe("fixture provider adapters", () => {
	it("resolves a canonical Poland to BGY flight through the public contract", async () => {
		const providers = createFixtureProviderAdapters();

		const result = await providers.flight.lookup({
			flightNumber: "FR1234",
			date: "2026-09-14",
		});

		expect(providers.mode).toBe("fixture");
		expect(result).toEqual({
			status: "success",
			value: {
				id: "fr1234:2026-09-14:waw-bgy",
				stableFlightId: "FR1234:2026-09-14:WAW:BGY:10:20",
				carrier: "Ryanair",
				flightNumber: "FR1234",
				operatingCarrierCode: "FR",
				operatingFlightNumber: "1234",
				date: "2026-09-14",
				origin: {
					iata: "WAW",
					name: "Lotnisko Chopina w Warszawie",
				},
				destination: {
					iata: "BGY",
					name: "Mediolan-Bergamo",
				},
				scheduledArrival: "2026-09-14T10:20:00+02:00",
				timeZone: "Europe/Rome",
			},
		});
	});

	it.each([
		["FX9001", "ambiguous"],
		["FX9002", "zero_result"],
		["FX9003", "timeout"],
		["FX9004", "rate_limited"],
		["FX9005", "provider_error"],
		["FX9006", "incomplete_response"],
		["FX9007", "malformed_response"],
	] as const)("normalizes the %s fixture without throwing", async (flightNumber, expectedStatus) => {
		const providers = createFixtureProviderAdapters();

		const result = await providers.flight.lookup({
			flightNumber,
			date: "2026-09-14",
		});

		expect(result.status).toBe(expectedStatus);
	});

	it("implements place autocomplete and details with the locked Milan viewport", async () => {
		const providers = createFixtureProviderAdapters();

		const autocomplete = await providers.places.autocomplete({
			query: "Duomo",
			languageCode: "pl",
		});
		const details = await providers.places.details({
			placeId: "fixture:place:duomo",
		});

		expect(providers.places.viewport).toBe(MILAN_MUNICIPALITY_VIEWPORT);
		expect(autocomplete).toEqual({
			status: "success",
			value: [
				{
					placeId: "fixture:place:duomo",
					primaryText: "Duomo di Milano",
					secondaryText: "Piazza del Duomo, Milano",
				},
			],
		});
		expect(details).toEqual({
			status: "success",
			value: {
				placeId: "fixture:place:duomo",
				displayName: "Duomo di Milano",
				coordinate: {
					latitude: 45.464098,
					longitude: 9.191926,
				},
			},
		});
	});

	it.each([
		["Via Torino", "fixture:place:via-torino", "Via Torino 42", "20123 Milano MI, Włochy"],
		["Hotel Berna", "fixture:place:hotel-berna", "Hotel Berna", "Via Napo Torriani 18, Milano"],
		["Duomo", "fixture:place:duomo", "Duomo di Milano", "Piazza del Duomo, Milano"],
	])("returns the stable %s address/hotel/place fixture", async (query, placeId, primaryText, secondaryText) => {
		const result = await createFixtureProviderAdapters().places.autocomplete({
			query,
			languageCode: "pl",
			regionCode: "IT",
			sessionToken: "planner-session-123456",
		});
		expect(result).toEqual({
			status: "success",
			value: [{ placeId, primaryText, secondaryText }],
		});
	});

	it.each([
		["fixture timeout", "timeout"],
		["fixture limit", "rate_limited"],
		["fixture awaria", "provider_error"],
		["fixture brak", "zero_result"],
		["fixture uszkodzone", "malformed_response"],
	] as const)("returns the controlled Places fixture %s as %s", async (query, status) => {
		const result = await createFixtureProviderAdapters().places.autocomplete({
			query,
			sessionToken: "planner-session-123456",
		});
		expect(result.status).toBe(status);
	});

	it("normalizes a fixture transit route without exposing provider payloads", async () => {
		const providers = createFixtureProviderAdapters();

		const result = await providers.transit.route({
			origin: { latitude: 45.6656872, longitude: 9.6978308 },
			destination: { latitude: 45.464098, longitude: 9.191926 },
			departureTime: "2026-09-14T11:05:00+02:00",
		});

		expect(result).toEqual({
			status: "success",
			value: [
				{
					id: "fixture:route:bgy-duomo:day",
					departureTime: "2026-09-14T11:05:00+02:00",
					arrivalTime: "2026-09-14T10:10:00.000Z",
					durationMinutes: 65,
					transfers: 0,
					walkingMinutes: 8,
					walkingMeters: 600,
					legs: [
						{
							mode: "bus",
							from: "Aeroporto BGY",
							to: "Milano Centrale",
							durationMinutes: 50,
							walkingMeters: 0,
						},
						{
							mode: "metro",
							from: "Centrale FS",
							to: "Duomo",
							durationMinutes: 7,
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
					fare: {
						currency: "EUR",
						amountMinor: 1_500,
						completeness: "complete",
					},
					source: {
						kind: "fixture",
						label: "synthetic_recorded_for_testing",
					},
				},
			],
		});
	});

	it("matches the same departure instant in canonical UTC form", async () => {
		const providers = createFixtureProviderAdapters();

		const result = await providers.transit.route({
			origin: { latitude: 45.6656872, longitude: 9.6978308 },
			destination: { latitude: 45.464098, longitude: 9.191926 },
			departureTime: "2026-09-14T09:05:00.000Z",
		});

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.value[0]?.id).toBe("fixture:route:bgy-duomo:day");
		}
	});

	it("provides a normalized hand-seeded transfer catalog merge input", async () => {
		const providers = createFixtureProviderAdapters();

		const result = await providers.transferCatalog.list();

		expect(result).toEqual({
			status: "success",
			value: [
				{
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
					costMinorMin: 1_000,
					costMinorMax: 1_200,
					purchaseUrl:
						"https://www.airportbusexpress.it/en-GB/bus-stop-timetable/bergamo-orio-al-serio-milan-central-station",
					publicationStatus: "published",
					provenance: "seeded_fixture",
					createdAt: "2026-07-27T00:00:00.000Z",
					updatedAt: "2026-07-27T00:00:00.000Z",
				},
			],
		});
	});
});
