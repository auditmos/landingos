import {
	currentDateInPoland,
	formatPolishDateInput,
	formatPolishDateTimeInput,
	parsePolishDateInput,
	parsePolishDateTimeInput,
} from "./polish-date";

describe("Polish date inputs", () => {
	it("uses the current calendar day in Poland", () => {
		expect(currentDateInPoland(new Date("2026-08-03T22:30:00.000Z"))).toBe("2026-08-04");
		expect(currentDateInPoland(new Date("2026-01-01T23:30:00.000Z"))).toBe("2026-01-02");
	});

	it("formats and parses a date as day.month.year", () => {
		expect(formatPolishDateInput("2026-08-04")).toBe("04.08.2026");
		expect(parsePolishDateInput("04.08.2026")).toBe("2026-08-04");
		expect(parsePolishDateInput("4/8/2026")).toBe("2026-08-04");
	});

	it("rejects impossible dates", () => {
		expect(parsePolishDateInput("31.02.2026")).toBeNull();
		expect(parsePolishDateInput("08.04.26")).toBeNull();
	});

	it("formats and parses local time using the 24-hour clock", () => {
		expect(formatPolishDateTimeInput("2026-08-04T23:45")).toBe("04.08.2026, 23:45");
		expect(parsePolishDateTimeInput("04.08.2026, 23:45")).toBe("2026-08-04T23:45");
		expect(parsePolishDateTimeInput("4.8.2026 07:05")).toBe("2026-08-04T07:05");
	});

	it("rejects AM/PM and invalid 24-hour times", () => {
		expect(parsePolishDateTimeInput("04.08.2026, 12:00 PM")).toBeNull();
		expect(parsePolishDateTimeInput("04.08.2026, 24:00")).toBeNull();
	});
});
