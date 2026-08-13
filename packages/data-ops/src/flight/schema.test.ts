import {
	canonicalFlightDesignator,
	FlightLookupRequestSchema,
	formatFlightDesignator,
	formatFlightLabel,
	ManualFlightRequestSchema,
	normalizeFlightNumber,
	parseFlightDesignator,
} from "./schema";

/*
 * Issue #17 assumptions approved before RED:
 * - input: one traveler-entered designator, at most 16 characters;
 * - output: canonical compact IATA plus a readable spaced form;
 * - accepted separators: one space or hyphen, plus the legacy duplicated-code form;
 * - deterministic ICAO aliases: WZZ→W6, RYR→FR, LOT→LO; no worldwide registry;
 * - malformed punctuation and unsupported ICAO are explicit errors, never guesses;
 * - parsing is pure and provider calls happen only after successful parsing.
 */

describe("flight input schemas", () => {
	it.each([
		["W61431", "W61431", "W6 1431", "iata"],
		["W6 1431", "W61431", "W6 1431", "iata"],
		["W6-1431", "W61431", "W6 1431", "iata"],
		["w6 1431", "W61431", "W6 1431", "iata"],
		["W6 W61431", "W61431", "W6 1431", "legacy"],
		["FR1234", "FR1234", "FR 1234", "iata"],
		["fr-1234", "FR1234", "FR 1234", "iata"],
		["LO 3921", "LO3921", "LO 3921", "iata"],
		["lo lo3921", "LO3921", "LO 3921", "legacy"],
	] as const)("parses %s as canonical %s", (input, canonical, display, convention) => {
		expect(parseFlightDesignator(input)).toEqual({
			status: "recognized",
			canonical,
			display,
			carrierCode: canonical.slice(0, 2),
			flightNumber: canonical.slice(2),
			convention,
		});
	});

	it.each([
		["", "empty", "Podaj numer lotu."],
		["FR", "incomplete", "Dokończ numer lotu: po kodzie przewoźnika wpisz od 1 do 4 cyfr."],
		["W6-", "incomplete", "Dokończ numer lotu: po kodzie przewoźnika wpisz od 1 do 4 cyfr."],
		[
			"EZY123",
			"unsupported_icao",
			"To wygląda jak trzy-literowy kod operacyjny. Podaj numer marketingowy z biletu lub karty pokładowej, np. W6 1431.",
		],
		["FR12/34", "malformed", "Podaj jeden numer lotu z biletu, np. W6 1431 lub FR1234."],
		["FR.1234", "malformed", "Podaj jeden numer lotu z biletu, np. W6 1431 lub FR1234."],
		["FR 12 34", "malformed", "Podaj jeden numer lotu z biletu, np. W6 1431 lub FR1234."],
	] as const)("rejects %j as %s with specific Polish guidance", (input, reason, message) => {
		expect(parseFlightDesignator(input)).toEqual({ status: "invalid", reason, message });
		const schemaResult = FlightLookupRequestSchema.safeParse({
			flightNumber: input,
			departureLocalDate: "2026-09-14",
		});
		expect(schemaResult.success).toBe(false);
		if (!schemaResult.success) {
			expect(schemaResult.error.flatten().fieldErrors.flightNumber).toEqual([message]);
		}
	});

	it.each([
		["WZZ1431", "W61431", "W6 1431"],
		["ryr 1234", "FR1234", "FR 1234"],
		["LOT-3921", "LO3921", "LO 3921"],
	] as const)("translates the supported ICAO input %s explicitly", (input, canonical, display) => {
		expect(parseFlightDesignator(input)).toEqual({
			status: "recognized",
			canonical,
			display,
			carrierCode: canonical.slice(0, 2),
			flightNumber: canonical.slice(2),
			convention: "icao",
		});
		expect(
			FlightLookupRequestSchema.parse({
				flightNumber: input,
				departureLocalDate: "2026-09-14",
			}).flightNumber,
		).toBe(canonical);
	});

	it.each([
		[
			{ marketingCarrierCode: "W6", marketingCarrierName: "W6", marketingFlightNumber: "1431" },
			"W6 1431",
		],
		[
			{
				marketingCarrierCode: "W6",
				marketingCarrierName: "Wizz Air",
				marketingFlightNumber: "1431",
			},
			"Wizz Air W6 1431",
		],
		[
			{
				marketingCarrierCode: "FR",
				marketingCarrierName: "Ryanair",
				marketingFlightNumber: "1234",
			},
			"Ryanair FR 1234",
		],
	] as const)("formats a flight label as %s without duplicating carrier codes", (flight, expected) => {
		expect(canonicalFlightDesignator(flight)).toBe(
			`${flight.marketingCarrierCode}${flight.marketingFlightNumber}`,
		);
		expect(formatFlightDesignator(canonicalFlightDesignator(flight))).toBe(
			`${flight.marketingCarrierCode} ${flight.marketingFlightNumber}`,
		);
		expect(formatFlightLabel(flight)).toBe(expected);
		expect(formatFlightLabel(flight)).not.toContain("W6 W6");
	});

	it.each([
		["fr1", "FR1"],
		[" W6 1431 ", "W61431"],
		["lo9999", "LO9999"],
	])("normalizes %s to %s", (input, expected) => {
		expect(normalizeFlightNumber(input)).toBe(expected);
		expect(
			FlightLookupRequestSchema.parse({
				flightNumber: input,
				departureLocalDate: "2026-09-14",
			}).flightNumber,
		).toBe(expected);
	});

	it.each([
		"FR12345",
		"F-123",
		"FR12A",
	])("rejects a flight outside the carrier plus 1–4 digit boundary: %s", (flightNumber) => {
		const result = FlightLookupRequestSchema.safeParse({
			flightNumber,
			departureLocalDate: "2026-09-14",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.flatten().fieldErrors.flightNumber).toEqual([
				"Podaj jeden numer lotu z biletu, np. W6 1431 lub FR1234.",
			]);
		}
	});

	it("returns Polish field errors for missing flight and date", () => {
		const result = FlightLookupRequestSchema.safeParse({
			flightNumber: "",
			departureLocalDate: "",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.flatten().fieldErrors).toEqual({
				flightNumber: ["Podaj numer lotu."],
				departureLocalDate: ["Podaj datę wylotu."],
			});
		}
	});

	it.each([
		"2026-02-30",
		"14-09-2026",
		"2026-9-1",
	])("rejects an invalid origin departure date: %s", (departureLocalDate) => {
		const result = FlightLookupRequestSchema.safeParse({
			flightNumber: "FR1234",
			departureLocalDate,
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.flatten().fieldErrors.departureLocalDate).toEqual([
				"Podaj prawidłową datę wylotu.",
			]);
		}
	});

	it("accepts manual completion only for BGY with an explicit UTC arrival", () => {
		expect(
			ManualFlightRequestSchema.parse({
				flightNumber: " fr1234 ",
				departureLocalDate: "2026-09-14",
				destinationIata: "BGY",
				scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
			}),
		).toEqual({
			flightNumber: "FR1234",
			departureLocalDate: "2026-09-14",
			destinationIata: "BGY",
			scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
		});
		expect(
			ManualFlightRequestSchema.safeParse({
				flightNumber: "FR1234",
				departureLocalDate: "2026-09-14",
				destinationIata: "MXP",
				scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
			}).success,
		).toBe(false);
	});
});
