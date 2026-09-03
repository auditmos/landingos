import { describe, expect, it, vi } from "vitest";
import { createAerodataboxFlightProvider } from "./live-flight-aerodatabox";
import type { ProviderFetch } from "./live-http";

function aeroFlight(
	overrides: Partial<{
		number: string;
		codeshareStatus: "IsOperator" | "IsCodeshared" | "Unknown";
		airlineName: string;
		airlineIata: string;
		originIata: string;
		originCountryCode: string;
		departureLocal: string;
		arrivalLocal: string;
		arrivalUtc: string | null;
	}> = {},
) {
	const values = {
		number: "FR 889",
		codeshareStatus: "IsOperator" as const,
		airlineName: "Ryanair",
		airlineIata: "FR",
		originIata: "KRK",
		originCountryCode: "PL",
		departureLocal: "2026-09-01 11:25+02:00",
		arrivalLocal: "2026-09-01 13:15+02:00",
		arrivalUtc: "2026-09-01 11:15Z",
		...overrides,
	};
	return {
		number: values.number,
		status: "Expected",
		codeshareStatus: values.codeshareStatus,
		airline: { name: values.airlineName, iata: values.airlineIata, icao: "RYR" },
		departure: {
			airport: {
				iata: values.originIata,
				name: "Kraków John Paul II",
				countryCode: values.originCountryCode,
				timeZone: "Europe/Warsaw",
			},
			scheduledTime: {
				local: values.departureLocal,
				utc: "2026-09-01 09:25Z",
			},
		},
		arrival: {
			airport: {
				iata: "BGY",
				name: "Milan Bergamo",
				countryCode: "IT",
				timeZone: "Europe/Rome",
			},
			scheduledTime: {
				local: values.arrivalLocal,
				...(values.arrivalUtc ? { utc: values.arrivalUtc } : {}),
			},
		},
	};
}

// Contract assumptions for this adapter:
// - one lookup performs exactly one AeroDataBox request;
// - the RapidAPI key is sent only as a server-side header;
// - the existing provider-neutral FlightProvider result is the only retained output;
// - ambiguous or incomplete operator identity fails closed (covered incrementally below).
describe("AeroDataBox live flight provider", () => {
	it("normalizes one scheduled Poland-to-BGY flight with one header-authenticated request", async () => {
		const fetchImpl = vi.fn<ProviderFetch>(async () => Response.json([aeroFlight()]));
		const provider = createAerodataboxFlightProvider(
			{ aerodataboxRapidApiKey: "aero-secret" },
			fetchImpl,
		);

		await expect(provider.lookup({ flightNumber: "fr889", date: "2026-09-01" })).resolves.toEqual({
			status: "success",
			value: {
				id: "fr889:2026-09-01:krk-bgy",
				carrier: "Ryanair",
				flightNumber: "FR889",
				operatingCarrierCode: "FR",
				operatingFlightNumber: "889",
				date: "2026-09-01",
				origin: { iata: "KRK", name: "Kraków John Paul II" },
				destination: { iata: "BGY", name: "Milan Bergamo" },
				scheduledArrival: "2026-09-01T11:15:00.000Z",
				timeZone: "Europe/Rome",
			},
		});
		expect(fetchImpl).toHaveBeenCalledOnce();
		const [url, init] = fetchImpl.mock.calls[0] ?? [];
		expect(url).toBe(
			"https://aerodatabox.p.rapidapi.com/flights/number/FR889/2026-09-01?dateLocalRole=Both&withAircraftImage=false&withLocation=false&withFlightPlan=false",
		);
		expect(url).not.toContain("aero-secret");
		expect(new Headers(init?.headers).get("X-RapidAPI-Key")).toBe("aero-secret");
		expect(new Headers(init?.headers).get("X-RapidAPI-Host")).toBe("aerodatabox.p.rapidapi.com");
	});

	it("selects the departure-local date and preserves an overnight arrival on the next day", async () => {
		const fetchImpl = vi.fn<ProviderFetch>(async () =>
			Response.json([
				aeroFlight({
					number: "FR 3505",
					departureLocal: "2026-09-01 22:30+02:00",
					arrivalLocal: "2026-09-02 00:20+02:00",
					arrivalUtc: "2026-09-01 22:20Z",
				}),
				aeroFlight({
					number: "FR 3505",
					departureLocal: "2026-09-02 22:30+02:00",
					arrivalLocal: "2026-09-03 00:20+02:00",
					arrivalUtc: "2026-09-02 22:20Z",
				}),
			]),
		);
		const provider = createAerodataboxFlightProvider(
			{ aerodataboxRapidApiKey: "aero-secret" },
			fetchImpl,
		);

		const result = await provider.lookup({ flightNumber: "FR3505", date: "2026-09-02" });

		expect(result).toMatchObject({
			status: "success",
			value: {
				date: "2026-09-02",
				scheduledArrival: "2026-09-02T22:20:00.000Z",
			},
		});
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it("fails closed when a codeshare response does not identify the operating flight", async () => {
		const fetchImpl = vi.fn<ProviderFetch>(async () =>
			Response.json([
				aeroFlight({
					number: "LH 1234",
					codeshareStatus: "IsCodeshared",
					airlineName: "Lufthansa",
					airlineIata: "LH",
				}),
			]),
		);
		const provider = createAerodataboxFlightProvider(
			{ aerodataboxRapidApiKey: "aero-secret" },
			fetchImpl,
		);

		await expect(provider.lookup({ flightNumber: "LH1234", date: "2026-09-01" })).resolves.toEqual({
			status: "incomplete_response",
			missingFields: ["operatingCarrierCode", "operatingFlightNumber"],
		});
	});

	it("uses the offset-bearing local schedule when AeroDataBox omits the UTC schedule", async () => {
		const fetchImpl = vi.fn<ProviderFetch>(async () =>
			Response.json([
				aeroFlight({
					number: "FR 8845",
					originIata: "WRO",
					arrivalLocal: "2026-09-01 17:10+02:00",
					arrivalUtc: null,
				}),
			]),
		);
		const provider = createAerodataboxFlightProvider(
			{ aerodataboxRapidApiKey: "aero-secret" },
			fetchImpl,
		);

		const result = await provider.lookup({ flightNumber: "FR8845", date: "2026-09-01" });

		expect(result).toMatchObject({
			status: "success",
			value: { scheduledArrival: "2026-09-01T15:10:00.000Z" },
		});
	});

	it("uses the complete duplicate when another matching operator record has no schedule", async () => {
		const fetchImpl = vi.fn<ProviderFetch>(async () =>
			Response.json([
				aeroFlight({
					number: "FR 8845",
					originIata: "WRO",
					arrivalLocal: "",
					arrivalUtc: null,
				}),
				aeroFlight({
					number: "FR 8845",
					originIata: "WRO",
					arrivalLocal: "2026-09-01 17:10+02:00",
					arrivalUtc: "2026-09-01 15:10Z",
				}),
			]),
		);
		const provider = createAerodataboxFlightProvider(
			{ aerodataboxRapidApiKey: "aero-secret" },
			fetchImpl,
		);

		const result = await provider.lookup({ flightNumber: "FR8845", date: "2026-09-01" });

		expect(result).toMatchObject({
			status: "success",
			value: { scheduledArrival: "2026-09-01T15:10:00.000Z" },
		});
	});

	it("normalizes empty, malformed-shape, and rate-limited provider outcomes", async () => {
		const empty = createAerodataboxFlightProvider(
			{ aerodataboxRapidApiKey: "aero-secret" },
			async () => Response.json([]),
		);
		const wrongShape = createAerodataboxFlightProvider(
			{ aerodataboxRapidApiKey: "aero-secret" },
			async () => Response.json({ flights: [] }),
		);
		const rateLimited = createAerodataboxFlightProvider(
			{ aerodataboxRapidApiKey: "aero-secret" },
			async () => Response.json({ message: "aero-secret" }, { status: 429 }),
		);

		await expect(empty.lookup({ flightNumber: "FR889", date: "2026-09-01" })).resolves.toEqual({
			status: "zero_result",
		});
		await expect(wrongShape.lookup({ flightNumber: "FR889", date: "2026-09-01" })).resolves.toEqual(
			{ status: "incomplete_response", missingFields: ["root"] },
		);
		const rateLimitResult = await rateLimited.lookup({
			flightNumber: "FR889",
			date: "2026-09-01",
		});
		expect(rateLimitResult).toEqual({ status: "rate_limited", retryable: true });
		expect(JSON.stringify(rateLimitResult)).not.toContain("aero-secret");
	});
});
