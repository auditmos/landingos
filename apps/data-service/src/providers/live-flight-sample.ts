import type { FlightLookupInput } from "./types";

export interface ScheduledFlightSampleCase {
	caseId: string;
	input: FlightLookupInput;
	expected: {
		originIata: string;
		destinationIata: "BGY";
		scheduledArrival: string;
		timeZone: "Europe/Rome";
	};
	source: {
		url: string;
		accessedAt: string;
	};
}

const ACCESSED_AT = "2026-08-12T16:26:56.000Z";
const SOURCE_BASE =
	"https://www.milanbergamoairport.it/en/seasonal-flights-timetable/calendar/linea/arr";

function scheduledCase(
	flightNumber: string,
	date: string,
	originIata: string,
	scheduledArrival: string,
): ScheduledFlightSampleCase {
	return {
		caseId: `${flightNumber.toLowerCase()}:${date}`,
		input: { flightNumber, date },
		expected: {
			originIata,
			destinationIata: "BGY",
			scheduledArrival,
			timeZone: "Europe/Rome",
		},
		source: {
			url: `${SOURCE_BASE}/${originIata}/?m=09&y=2026`,
			accessedAt: ACCESSED_AT,
		},
	};
}

export const LIVE_FLIGHT_SAMPLE_V1 = {
	schemaVersion: "landingos-live-flight-sample-v1" as const,
	description: "Scheduled direct Poland to BGY flights verified in the BGY seasonal timetable.",
	cases: [
		scheduledCase("W61431", "2026-09-01", "WAW", "2026-09-01T08:05:00+02:00"),
		scheduledCase("W61433", "2026-09-01", "WAW", "2026-09-01T20:05:00+02:00"),
		scheduledCase("FR889", "2026-09-01", "KRK", "2026-09-01T13:15:00+02:00"),
		scheduledCase("FR3536", "2026-09-01", "KRK", "2026-09-01T23:45:00+02:00"),
		scheduledCase("FR8845", "2026-09-01", "WRO", "2026-09-01T17:10:00+02:00"),
		scheduledCase("FR3279", "2026-09-01", "GDN", "2026-09-01T22:20:00+02:00"),
		scheduledCase("FR9094", "2026-09-02", "GDN", "2026-09-02T17:05:00+02:00"),
		scheduledCase("FR3505", "2026-09-02", "KRK", "2026-09-03T00:20:00+02:00"),
		scheduledCase("FR6258", "2026-09-03", "KRK", "2026-09-03T11:30:00+02:00"),
		scheduledCase("FR9195", "2026-09-04", "WRO", "2026-09-04T08:15:00+02:00"),
	],
};
