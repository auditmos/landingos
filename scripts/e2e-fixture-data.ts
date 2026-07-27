export function fixtureFlight(flightNumber = "FR1234", manual = false) {
	const normalized = flightNumber.toUpperCase();
	return {
		status: "recognized",
		flight: {
			id: normalized === "FR9999" ? "flight-second-room" : `flight-${normalized.toLowerCase()}`,
			marketingCarrierCode: normalized.slice(0, 2),
			marketingCarrierName: manual ? "Lot wpisany ręcznie" : "Ryanair",
			marketingFlightNumber: normalized.slice(2),
			operatingCarrierCode: null,
			operatingFlightNumber: null,
			departureLocalDate: "2026-09-14",
			originIata: manual ? "ZZZ" : "WAW",
			destinationIata: "BGY",
			scheduledArrivalUtc: "2026-09-14T08:20:00Z",
			displayTimezone: "Europe/Rome",
			source: manual ? "manual" : "provider",
		},
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
