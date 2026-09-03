import { describe, expect, it, vi } from "vitest";
import { runFlightProviderComparison } from "./flight-provider-comparison";
import { LIVE_FLIGHT_SAMPLE_V1 } from "./live-flight-sample";
import type { ProviderFetch } from "./live-http";

function referenceFor(flightNumber: string, date: string) {
	return LIVE_FLIGHT_SAMPLE_V1.cases.find(
		(item) => item.input.flightNumber === flightNumber && item.input.date === date,
	);
}

function comparisonFetch(failingAeroCases = new Set<string>()) {
	return vi.fn<ProviderFetch>(async (url) => {
		if (url.startsWith("https://api.aviationstack.com")) {
			const parsed = new URL(url);
			const flightNumber = `${parsed.searchParams.get("airline_iata")}${parsed.searchParams.get("flight_number")}`;
			const date = parsed.searchParams.get("date") ?? "";
			const sample = referenceFor(flightNumber, date);
			return Response.json({
				data: [
					{
						flight: { number: flightNumber.slice(2), iataNumber: flightNumber },
						airline: { name: "Measured airline", iataCode: flightNumber.slice(0, 2) },
						departure: {
							iataCode: sample?.expected.originIata,
							scheduledTime: "06:00",
						},
						arrival: {
							iataCode: "BGY",
							scheduledTime: sample?.expected.scheduledArrival.slice(11, 16),
						},
						codeshared: null,
					},
				],
			});
		}

		const parsed = new URL(url);
		const path = parsed.pathname.split("/");
		const flightNumber = path[3] ?? "";
		const date = path[4] ?? "";
		const sample = referenceFor(flightNumber, date);
		if (!sample) return Response.json([]);
		if (failingAeroCases.has(sample.caseId)) return Response.json([]);
		const carrierCode = flightNumber.slice(0, 2);
		return Response.json([
			{
				number: `${carrierCode} ${flightNumber.slice(2)}`,
				codeshareStatus: "IsOperator",
				airline: { name: "Measured airline", iata: carrierCode },
				departure: {
					airport: {
						iata: sample.expected.originIata,
						name: sample.expected.originIata,
						countryCode: "PL",
						timeZone: "Europe/Warsaw",
					},
					scheduledTime: { local: `${date} 06:00+02:00`, utc: `${date} 04:00Z` },
				},
				arrival: {
					airport: {
						iata: "BGY",
						name: "Milan Bergamo",
						countryCode: "IT",
						timeZone: "Europe/Rome",
					},
					scheduledTime: {
						local: sample.expected.scheduledArrival.replace("T", " "),
						utc: new Date(sample.expected.scheduledArrival).toISOString(),
					},
				},
			},
		]);
	});
}

describe("flight provider comparison", () => {
	it("compares both providers against exactly the same ten reference flights", async () => {
		const fetchImpl = comparisonFetch();
		const progress: string[] = [];
		const sleep = vi.fn(async (_milliseconds: number) => undefined);
		let tick = 0;

		const evidence = await runFlightProviderComparison({
			credentials: {
				aviationstackAccessKey: "aviation-secret",
				aerodataboxRapidApiKey: "aero-secret",
			},
			fetchImpl,
			generatedAt: "2026-08-12T17:00:00.000Z",
			nowMs: () => tick++,
			onProgress: (message) => progress.push(message),
			sleep,
		});

		expect(evidence.schemaVersion).toBe("landingos-flight-provider-comparison-v1");
		expect(evidence.dataset).toEqual({
			schemaVersion: LIVE_FLIGHT_SAMPLE_V1.schemaVersion,
			total: 10,
			caseIds: LIVE_FLIGHT_SAMPLE_V1.cases.map((item) => item.caseId),
		});
		expect(evidence.cases.map((item) => item.input)).toEqual(
			LIVE_FLIGHT_SAMPLE_V1.cases.map((item) => item.input),
		);
		expect(evidence.providers).toEqual({
			aviationstack: {
				total: 10,
				correct: 9,
				requiredCorrect: 9,
				status: "passing",
				requests: 10,
			},
			aerodatabox: {
				total: 10,
				correct: 10,
				requiredCorrect: 9,
				status: "passing",
				requests: 10,
				apiUnits: 20,
			},
		});
		expect(evidence.productionReadiness).toEqual({
			ready: false,
			blockers: ["commercial_licensing_acceptance_missing", "privacy_compliance_approval_missing"],
		});
		expect(fetchImpl).toHaveBeenCalledTimes(20);
		expect(
			fetchImpl.mock.calls.filter(([url]) => url.startsWith("https://api.aviationstack.com")),
		).toHaveLength(10);
		expect(
			fetchImpl.mock.calls.filter(([url]) => url.startsWith("https://aerodatabox.p.rapidapi.com")),
		).toHaveLength(10);
		expect(sleep).toHaveBeenCalledTimes(18);
		expect(progress).toContain("[flight-compare] wait 2/10 30/60s");
		expect(progress).toContain("[flight-compare] wait 2/10 60/60s");
		const serialized = JSON.stringify(evidence);
		expect(serialized).not.toContain("aviation-secret");
		expect(serialized).not.toContain("aero-secret");
		expect(serialized).not.toContain("rawPayload");
	});

	it("fails the AeroDataBox 9/10 gate when two reference flights are not recognized", async () => {
		const evidence = await runFlightProviderComparison({
			credentials: {
				aviationstackAccessKey: "aviation-secret",
				aerodataboxRapidApiKey: "aero-secret",
			},
			fetchImpl: comparisonFetch(new Set(["w61431:2026-09-01", "fr889:2026-09-01"])),
			generatedAt: "2026-08-12T17:00:00.000Z",
			nowMs: () => 0,
			onProgress: () => undefined,
			sleep: async () => undefined,
		});

		expect(evidence.providers.aerodatabox).toMatchObject({
			total: 10,
			correct: 8,
			requiredCorrect: 9,
			status: "failing",
		});
		expect(evidence.productionReadiness.blockers).toContain(
			"aerodatabox_recognition_below_9_of_10",
		);
	});
});
