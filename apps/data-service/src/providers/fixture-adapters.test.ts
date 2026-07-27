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
				carrier: "Ryanair",
				flightNumber: "FR1234",
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
					displayText: "Duomo di Milano",
				},
			],
		});
		expect(details).toEqual({
			status: "success",
			value: {
				placeId: "fixture:place:duomo",
				displayText: "Duomo di Milano",
				coordinate: {
					latitude: 45.464098,
					longitude: 9.191926,
				},
			},
		});
	});

	it("normalizes a fixture transit route without exposing provider payloads", async () => {
		const providers = createFixtureProviderAdapters();

		const result = await providers.transit.route({
			origin: { latitude: 45.6739, longitude: 9.7042 },
			destination: { latitude: 45.464098, longitude: 9.191926 },
			departureTime: "2026-09-14T11:05:00+02:00",
		});

		expect(result).toEqual({
			status: "success",
			value: [
				{
					id: "fixture:route:bgy-duomo:day",
					durationMinutes: 65,
					transfers: 0,
					walkingMinutes: 8,
					legs: [
						{
							mode: "bus",
							from: "Aeroporto BGY",
							to: "Milano Centrale",
							durationMinutes: 50,
						},
						{
							mode: "metro",
							from: "Centrale FS",
							to: "Duomo",
							durationMinutes: 7,
						},
						{
							mode: "walk",
							from: "Duomo M1/M3",
							to: "Duomo di Milano",
							durationMinutes: 8,
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

	it("provides a normalized hand-seeded transfer catalog merge input", async () => {
		const providers = createFixtureProviderAdapters();

		const result = await providers.transferCatalog.list();

		expect(result).toEqual({
			status: "success",
			value: [
				{
					id: "fixture:transfer:airport-bus-centrale",
					operator: "Airport Bus Express",
					service: "BGY → Milano Centrale",
					sourceUrl: "https://www.milanbergamoairport.it/en/bus/",
					checkedOn: "2026-07-27",
					priceRange: {
						currency: "EUR",
						minorMin: 1_000,
						minorMax: 1_200,
					},
					purchaseUrl:
						"https://www.airportbusexpress.it/en-GB/bus-stop-timetable/bergamo-orio-al-serio-milan-central-station",
					provenance: "synthetic_recorded_for_testing",
				},
			],
		});
	});
});
