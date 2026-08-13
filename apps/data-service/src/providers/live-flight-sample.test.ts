import { describe, expect, it } from "vitest";
import { LIVE_FLIGHT_SAMPLE_V1 } from "./live-flight-sample";

describe("versioned live flight sample", () => {
	it("contains at least ten sourced scheduled PL→BGY cases across origins and dates", () => {
		expect(LIVE_FLIGHT_SAMPLE_V1.schemaVersion).toBe("landingos-live-flight-sample-v1");
		expect(LIVE_FLIGHT_SAMPLE_V1.cases.length).toBeGreaterThanOrEqual(10);
		expect(
			new Set(LIVE_FLIGHT_SAMPLE_V1.cases.map((item) => item.expected.originIata)).size,
		).toBeGreaterThanOrEqual(3);
		expect(
			new Set(LIVE_FLIGHT_SAMPLE_V1.cases.map((item) => item.input.date)).size,
		).toBeGreaterThanOrEqual(3);
		expect(LIVE_FLIGHT_SAMPLE_V1.cases.some((item) => item.input.flightNumber === "W61431")).toBe(
			true,
		);

		for (const item of LIVE_FLIGHT_SAMPLE_V1.cases) {
			expect(item.caseId).toBe(`${item.input.flightNumber.toLowerCase()}:${item.input.date}`);
			expect(item.input.flightNumber).toMatch(/^[A-Z0-9]{2}\d{1,4}$/);
			expect(item.expected.destinationIata).toBe("BGY");
			expect(item.expected.timeZone).toBe("Europe/Rome");
			expect(item.expected.scheduledArrival).toMatch(/^2026-\d{2}-\d{2}T\d{2}:\d{2}:00\+02:00$/);
			expect(item.source.url).toMatch(
				/^https:\/\/www\.milanbergamoairport\.it\/en\/seasonal-flights-timetable\//,
			);
			expect(new Date(item.source.accessedAt).toISOString()).toBe(item.source.accessedAt);
		}
	});
});
