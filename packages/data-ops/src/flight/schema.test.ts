import {
	FlightLookupRequestSchema,
	ManualFlightRequestSchema,
	normalizeFlightNumber,
} from "./schema";

describe("flight input schemas", () => {
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
		"FR",
		"FR12345",
		"F-123",
		"FR12A",
		"LOT123",
	])("rejects a flight outside the carrier plus 1–4 digit boundary: %s", (flightNumber) => {
		const result = FlightLookupRequestSchema.safeParse({
			flightNumber,
			departureLocalDate: "2026-09-14",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.flatten().fieldErrors.flightNumber).toEqual([
				"Podaj kod przewoźnika i od 1 do 4 cyfr, np. FR1234.",
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
