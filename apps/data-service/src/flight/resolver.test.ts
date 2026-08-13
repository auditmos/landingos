import type {
	FlightInstance,
	FlightInstanceWrite,
	FlightLookupRequest,
} from "@repo/data-ops/flight";
import { describe, expect, it, vi } from "vitest";
import type { FlightProvider, ProviderFlight } from "../providers";
import { createFixtureProviderAdapters } from "../providers";
import { completeManualFlight, type FlightInstanceRepository, resolveFlight } from "./resolver";

function memoryRepository(): FlightInstanceRepository & { rows: Map<string, FlightInstance> } {
	const rows = new Map<string, FlightInstance>();
	return {
		rows,
		save: async ({ canonicalKey: _canonicalKey, ...flight }: FlightInstanceWrite) => {
			const existing = rows.get(flight.id);
			if (existing) return existing;
			rows.set(flight.id, flight);
			return flight;
		},
	};
}

function successProvider(value: ProviderFlight): FlightProvider {
	return { lookup: vi.fn(async () => ({ status: "success" as const, value })) };
}

describe("flight context resolver", () => {
	it("recognizes a fixture and emits the locked canonical BGY shape", async () => {
		const repository = memoryRepository();
		const result = await resolveFlight(
			{ flightNumber: " fr1234 ", departureLocalDate: "2026-09-14" },
			{ provider: createFixtureProviderAdapters().flight, repository },
		);
		expect(result).toEqual({
			status: "recognized",
			flight: {
				id: expect.any(String),
				marketingCarrierCode: "FR",
				marketingCarrierName: "Ryanair",
				marketingFlightNumber: "1234",
				operatingCarrierCode: "FR",
				operatingFlightNumber: "1234",
				departureLocalDate: "2026-09-14",
				originIata: "WAW",
				destinationIata: "BGY",
				scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
				displayTimezone: "Europe/Rome",
				source: "provider",
			},
		});
		expect(repository.rows.size).toBe(1);
	});

	it.each([
		["FX9002", "not_found"],
		["FX9003", "timeout"],
		["FX9004", "rate_limited"],
		["FX9005", "provider_error"],
		["FX9006", "incomplete"],
		["FX9007", "incomplete"],
		["FX9001", "incomplete"],
	] as const)("maps %s to exact manual reason %s and preserves normalized input", async (flightNumber, reason) => {
		const result = await resolveFlight(
			{ flightNumber: ` ${flightNumber.toLowerCase()} `, departureLocalDate: "2026-09-14" },
			{
				provider: createFixtureProviderAdapters().flight,
				repository: memoryRepository(),
			},
		);
		expect(result).toEqual({
			status: "manual_required",
			reason,
			flightNumber,
			departureLocalDate: "2026-09-14",
		});
	});

	it("uses a provider stable identity so codeshares persist as one instance", async () => {
		const repository = memoryRepository();
		const provider = createFixtureProviderAdapters().flight;
		const first = await resolveFlight(
			{ flightNumber: "FR8123", departureLocalDate: "2026-10-02" },
			{ provider, repository },
		);
		const second = await resolveFlight(
			{ flightNumber: "W69000", departureLocalDate: "2026-10-02" },
			{ provider, repository },
		);
		expect(first.status).toBe("recognized");
		expect(second.status).toBe("recognized");
		if (first.status === "recognized" && second.status === "recognized") {
			expect(second.flight.id).toBe(first.flight.id);
			expect(first.flight).toMatchObject({
				marketingCarrierCode: "FR",
				marketingFlightNumber: "8123",
			});
			expect(second.flight).toMatchObject({
				marketingCarrierCode: "W6",
				marketingFlightNumber: "9000",
			});
		}
		expect(repository.rows.size).toBe(1);
	});

	it("falls back to operating identity and separates two departure dates", async () => {
		const repository = memoryRepository();
		const providerValue: ProviderFlight = {
			id: "",
			carrier: "Ryanair",
			flightNumber: "FR1234",
			operatingCarrierCode: "FR",
			operatingFlightNumber: "1234",
			date: "2026-09-14",
			origin: { iata: "WAW", name: "Warszawa" },
			destination: { iata: "BGY", name: "Mediolan-Bergamo" },
			scheduledArrival: "2026-09-14T10:20:00+02:00",
			timeZone: "Europe/Rome",
		};
		const run = (input: FlightLookupRequest, value: ProviderFlight) =>
			resolveFlight(input, { provider: successProvider(value), repository });
		const first = await run(
			{ flightNumber: "FR1234", departureLocalDate: "2026-09-14" },
			providerValue,
		);
		const second = await run(
			{ flightNumber: "FR1234", departureLocalDate: "2026-09-15" },
			{
				...providerValue,
				date: "2026-09-15",
				scheduledArrival: "2026-09-15T10:20:00+02:00",
			},
		);
		expect(first.status).toBe("recognized");
		expect(second.status).toBe("recognized");
		expect(repository.rows.size).toBe(2);
	});

	it("separates departure dates even when a provider reuses its stable flight identifier", async () => {
		const repository = memoryRepository();
		const providerValue: ProviderFlight = {
			id: "provider-flight",
			stableFlightId: "provider-series-fr1234",
			carrier: "Ryanair",
			flightNumber: "FR1234",
			operatingCarrierCode: "FR",
			operatingFlightNumber: "1234",
			date: "2026-09-14",
			origin: { iata: "WAW", name: "Warszawa" },
			destination: { iata: "BGY", name: "Mediolan-Bergamo" },
			scheduledArrival: "2026-09-14T10:20:00+02:00",
			timeZone: "Europe/Rome",
		};
		await resolveFlight(
			{ flightNumber: "FR1234", departureLocalDate: "2026-09-14" },
			{ provider: successProvider(providerValue), repository },
		);
		await resolveFlight(
			{ flightNumber: "FR1234", departureLocalDate: "2026-09-15" },
			{
				provider: successProvider({
					...providerValue,
					date: "2026-09-15",
					scheduledArrival: "2026-09-15T10:20:00+02:00",
				}),
				repository,
			},
		);
		expect(repository.rows.size).toBe(2);
	});

	it("makes repeated manual completion idempotent", async () => {
		const repository = memoryRepository();
		const input = {
			flightNumber: "FR1234",
			departureLocalDate: "2026-09-14",
			destinationIata: "BGY" as const,
			scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
		};
		const first = await completeManualFlight(input, { repository });
		const second = await completeManualFlight(input, { repository });
		expect(second).toEqual(first);
		expect(first).toMatchObject({
			status: "recognized",
			flight: {
				source: "manual",
				destinationIata: "BGY",
				scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
			},
		});
		expect(repository.rows.size).toBe(1);
	});

	it("keeps one manual flight and the first arrival for equivalent input despite a later conflict", async () => {
		const repository = memoryRepository();
		const first = await completeManualFlight(
			{
				flightNumber: "w6-1431",
				departureLocalDate: "2026-09-14",
				destinationIata: "BGY",
				scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
			},
			{ repository },
		);
		const conflicting = await completeManualFlight(
			{
				flightNumber: "W6 W61431",
				departureLocalDate: "2026-09-14",
				destinationIata: "BGY",
				scheduledArrivalUtc: "2026-09-14T08:37:00.000Z",
			},
			{ repository },
		);

		expect(repository.rows.size).toBe(1);
		expect(conflicting.flight.id).toBe(first.flight.id);
		expect(conflicting.flight.scheduledArrivalUtc).toBe("2026-09-14T08:20:00.000Z");
		expect(conflicting).toMatchObject({
			manualArrivalConflict: {
				requestedScheduledArrivalUtc: "2026-09-14T08:37:00.000Z",
				sharedScheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
			},
		});
	});

	it("isolates manual flights by normalized designator and departure date", async () => {
		const repository = memoryRepository();
		const complete = (flightNumber: string, departureLocalDate: string) =>
			completeManualFlight(
				{
					flightNumber,
					departureLocalDate,
					destinationIata: "BGY",
					scheduledArrivalUtc: `${departureLocalDate}T08:20:00.000Z`,
				},
				{ repository },
			);
		const [base, differentDate, differentDesignator] = await Promise.all([
			complete("W6 1431", "2026-09-14"),
			complete("W61431", "2026-09-15"),
			complete("FR1431", "2026-09-14"),
		]);

		expect(
			new Set([base.flight.id, differentDate.flight.id, differentDesignator.flight.id]).size,
		).toBe(3);
		expect(repository.rows.size).toBe(3);
	});

	it("retries after a timeout without losing form data or duplicating rows", async () => {
		const repository = memoryRepository();
		const fixture = createFixtureProviderAdapters().flight;
		let calls = 0;
		const provider: FlightProvider = {
			lookup: async (input) => {
				calls += 1;
				return calls === 1 ? { status: "timeout", retryable: true } : fixture.lookup(input);
			},
		};
		const input = { flightNumber: "FR1234", departureLocalDate: "2026-09-14" };
		expect(await resolveFlight(input, { provider, repository })).toEqual({
			status: "manual_required",
			reason: "timeout",
			flightNumber: "FR1234",
			departureLocalDate: "2026-09-14",
		});
		const retried = await resolveFlight(input, { provider, repository });
		expect(retried.status).toBe("recognized");
		expect(repository.rows.size).toBe(1);
	});
});
