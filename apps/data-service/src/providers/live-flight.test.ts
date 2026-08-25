import { describe, expect, it } from "vitest";
import { createLiveFlightProvider } from "./live-flight";

/*
 * Issue #16 future-flight assumptions approved before RED:
 * - input stays the provider-neutral flight designator plus departure-local ISO date;
 * - a date after the injected current date uses BGY's future arrival schedule, filtered by
 *   airline IATA and numeric flight number;
 * - output stays ProviderResult<ProviderFlight>, with the local arrival represented in
 *   Europe/Rome and no provider-specific fields escaping the adapter;
 * - the first query uses the departure date as the BGY arrival date; an overnight arrival
 *   may use the existing manual fallback and is the explicitly accepted one miss in 9/10;
 * - today/past routing and live-spike pacing are tested in later slices.
 */

describe("live flight provider", () => {
	it("normalizes a future BGY arrival schedule through the existing flight contract", async () => {
		const requestedUrls: string[] = [];
		const provider = createLiveFlightProvider(
			{ aviationstackAccessKey: "test-flight-key" },
			async (url) => {
				requestedUrls.push(url);
				return Response.json({
					data: [
						{
							weekday: "2",
							departure: { iataCode: "WAW", scheduledTime: "06:00" },
							arrival: { iataCode: "BGY", scheduledTime: "08:05" },
							airline: { name: "Wizz Air", iataCode: "W6" },
							flight: { number: "1431", iataNumber: "W61431" },
							codeshared: null,
						},
					],
				});
			},
			{ today: () => "2026-08-12" },
		);

		const result = await provider.lookup({
			flightNumber: " w61431 ",
			date: "2026-09-01",
		});

		expect(result).toEqual({
			status: "success",
			value: {
				id: "w61431:2026-09-01:waw-bgy",
				carrier: "Wizz Air",
				flightNumber: "W61431",
				operatingCarrierCode: "W6",
				operatingFlightNumber: "1431",
				date: "2026-09-01",
				origin: { iata: "WAW", name: "WAW" },
				destination: { iata: "BGY", name: "BGY" },
				scheduledArrival: "2026-09-01T08:05:00+02:00",
				timeZone: "Europe/Rome",
			},
		});
		expect(requestedUrls).toHaveLength(1);
		const requested = new URL(requestedUrls[0] as string);
		expect(requested.pathname).toBe("/v1/flightsFuture");
		expect(Object.fromEntries(requested.searchParams)).toEqual({
			access_key: "test-flight-key",
			iataCode: "BGY",
			type: "arrival",
			date: "2026-09-01",
			airline_iata: "W6",
			flight_number: "1431",
			limit: "100",
		});
	});

	it("normalizes the space-separated local timestamp returned by the future schedule endpoint", async () => {
		const provider = createLiveFlightProvider(
			{ aviationstackAccessKey: "test-flight-key" },
			async () =>
				Response.json({
					data: [
						{
							departure: { iataCode: "WAW", scheduledTime: "2026-09-01 06:00:00" },
							arrival: { iataCode: "BGY", scheduledTime: "2026-09-01 08:05:00" },
							airline: { name: "Wizz Air", iataCode: "W6" },
							flight: { number: "1431", iataNumber: "W61431" },
							codeshared: null,
						},
					],
				}),
			{ today: () => "2026-08-12" },
		);

		const result = await provider.lookup({ flightNumber: "W61431", date: "2026-09-01" });

		expect(result).toMatchObject({
			status: "success",
			value: {
				scheduledArrival: "2026-09-01T08:05:00+02:00",
				timeZone: "Europe/Rome",
			},
		});
	});

	it("normalizes an Aviationstack response into a canonical flight instance", async () => {
		const requestedUrls: string[] = [];
		const provider = createLiveFlightProvider(
			{ aviationstackAccessKey: "test-flight-key" },
			async (url) => {
				requestedUrls.push(url);
				return Response.json({
					data: [
						{
							flight: { iata: "FR1234" },
							airline: { name: "Ryanair" },
							departure: {
								iata: "WAW",
								airport: "Lotnisko Chopina w Warszawie",
							},
							arrival: {
								iata: "BGY",
								airport: "Mediolan-Bergamo",
								scheduled: "2026-09-14T10:20:00+02:00",
								timezone: "Europe/Rome",
							},
						},
					],
				});
			},
			{ today: () => "2026-10-01" },
		);

		const result = await provider.lookup({
			flightNumber: " fr1234 ",
			date: "2026-09-14",
		});

		expect(result).toEqual({
			status: "success",
			value: {
				id: "fr1234:2026-09-14:waw-bgy",
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
		expect(requestedUrls).toEqual([
			"https://api.aviationstack.com/v1/flights?access_key=test-flight-key&flight_iata=FR1234&flight_date=2026-09-14",
		]);
	});

	it.each([
		["airline", { name: "Ryanair" }, undefined, ["carrier"]],
		["departure airport", { name: "Ryanair" }, "departure.airport", ["originName"]],
		["arrival timezone", { name: "Ryanair" }, "arrival.timezone", ["timeZone"]],
	] as const)("names exactly the absent %s of a past-dated response", async (_label, airline, omitted, expectedMissing) => {
		const departure: Record<string, unknown> = {
			iata: "WAW",
			airport: "Lotnisko Chopina w Warszawie",
		};
		const arrival: Record<string, unknown> = {
			iata: "BGY",
			airport: "Mediolan-Bergamo",
			scheduled: "2026-09-14T10:20:00+02:00",
			timezone: "Europe/Rome",
		};
		if (omitted === "departure.airport") delete departure.airport;
		if (omitted === "arrival.timezone") delete arrival.timezone;
		const provider = createLiveFlightProvider(
			{ aviationstackAccessKey: "test-flight-key" },
			async () =>
				Response.json({
					data: [
						{
							flight: { iata: "FR1234" },
							...(omitted === undefined ? {} : { airline }),
							departure,
							arrival,
						},
					],
				}),
			{ today: () => "2026-10-01" },
		);

		const result = await provider.lookup({ flightNumber: "FR1234", date: "2026-09-14" });

		expect(result).toEqual({
			status: "incomplete_response",
			missingFields: expectedMissing,
		});
	});

	it("names exactly the absent operating carrier of a future-dated response", async () => {
		const provider = createLiveFlightProvider(
			{ aviationstackAccessKey: "test-flight-key" },
			async () =>
				Response.json({
					data: [
						{
							departure: { iataCode: "WAW", scheduledTime: "06:00" },
							arrival: { iataCode: "BGY", scheduledTime: "08:05" },
							airline: { name: "Wizz Air" },
							flight: { number: "1431", iataNumber: "W61431" },
							codeshared: null,
						},
					],
				}),
			{ today: () => "2026-08-12" },
		);

		const result = await provider.lookup({ flightNumber: "W61431", date: "2026-09-01" });

		expect(result).toEqual({
			status: "incomplete_response",
			missingFields: ["operatingCarrierCode"],
		});
	});

	it("names every absent future-schedule field in construction order", async () => {
		const provider = createLiveFlightProvider(
			{ aviationstackAccessKey: "test-flight-key" },
			async () =>
				Response.json({
					data: [{ flight: { iataNumber: "W61431" }, codeshared: null }],
				}),
			{ today: () => "2026-08-12" },
		);

		const result = await provider.lookup({ flightNumber: "W61431", date: "2026-09-01" });

		expect(result).toEqual({
			status: "incomplete_response",
			missingFields: [
				"carrier",
				"operatingCarrierCode",
				"operatingFlightNumber",
				"originIata",
				"destinationIata",
				"scheduledArrival",
			],
		});
	});
});
