import { parseFlightDesignator } from "../packages/data-ops/dist/flight/index.js";

export function fixtureFlight(
	flightNumber = "FR1234",
	options: {
		manual?: boolean;
		departureLocalDate?: string;
		scheduledArrivalUtc?: string;
		id?: string;
		manualArrivalConflict?: {
			requestedScheduledArrivalUtc: string;
			sharedScheduledArrivalUtc: string;
		};
	} = {},
) {
	const parsed = parseFlightDesignator(flightNumber);
	if (parsed.status !== "recognized")
		throw new Error(`Invalid fixture designator: ${flightNumber}`);
	const normalized = parsed.canonical;
	const manual = options.manual ?? false;
	const carrierNames: Record<string, string> = { FR: "Ryanair", LO: "LOT", W6: "Wizz Air" };
	return {
		status: "recognized",
		flight: {
			id:
				options.id ??
				(normalized === "FR9999" ? "flight-second-room" : `flight-${normalized.toLowerCase()}`),
			marketingCarrierCode: normalized.slice(0, 2),
			marketingCarrierName: manual
				? normalized.slice(0, 2)
				: (carrierNames[normalized.slice(0, 2)] ?? normalized.slice(0, 2)),
			marketingFlightNumber: normalized.slice(2),
			operatingCarrierCode: null,
			operatingFlightNumber: null,
			departureLocalDate: options.departureLocalDate ?? "2026-09-14",
			originIata: manual ? "ZZZ" : "WAW",
			destinationIata: "BGY",
			scheduledArrivalUtc: options.scheduledArrivalUtc ?? "2026-09-14T08:20:00Z",
			displayTimezone: "Europe/Rome",
			source: manual ? "manual" : "provider",
		},
		...(options.manualArrivalConflict
			? { manualArrivalConflict: options.manualArrivalConflict }
			: {}),
	};
}

export function fixtureJourneyVariant(serviceName = "Airport Bus Express", id = "fixture-bus") {
	return {
		id,
		badges: ["recommended", "simplest"],
		durationMinutes: 55,
		arrivalTimeUtc: "2026-09-14T10:00:00Z",
		cost: { currency: "EUR", minorMin: 1200, minorMax: 1200, completeness: "complete" },
		transferCount: 0,
		walkingMinutes: 5,
		walkingMeters: 350,
		steps: [
			{
				mode: "bus",
				from: "Lotnisko BGY",
				to: "Milano Centrale",
				durationMinutes: 55,
				walkingMeters: 350,
			},
		],
		sourceReferences: [
			{
				kind: "catalog",
				label: serviceName,
				url: "https://www.milanbergamoairport.it/en/bus/",
				checkedAt: "2026-07-27T10:00:00Z",
			},
		],
		manualVerification: null,
		externalLinks: [
			{
				kind: "source",
				label: "Sprawdź u operatora",
				url: "https://www.milanbergamoairport.it/en/bus/",
			},
		],
	};
}
