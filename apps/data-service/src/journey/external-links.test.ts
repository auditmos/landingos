import { sanitizeJourneyExternalUrl } from "@repo/data-ops/journey";

describe("external journey link allowlist", () => {
	it.each([
		[
			"https://www.airportbusexpress.it/en-GB/tickets",
			"https://www.airportbusexpress.it/en-GB/tickets",
		],
		["https://www.milanbergamoairport.it/en/bus/", "https://www.milanbergamoairport.it/en/bus/"],
		[
			"https://www.google.com/maps/dir/?api=1&destination=45.46%2C9.19",
			"https://www.google.com/maps/dir/?api=1&destination=45.46%2C9.19",
		],
		[
			"https://www.google.com/url?url=https%3A%2F%2Fwww.airportbusexpress.it%2Ftickets",
			"https://www.google.com/url?url=https%3A%2F%2Fwww.airportbusexpress.it%2Ftickets",
		],
	])("allows the exact HTTPS host %s", (input, expected) => {
		expect(sanitizeJourneyExternalUrl(input)).toBe(expected);
	});

	it.each([
		"http://www.airportbusexpress.it/tickets",
		"https://evil.example/tickets",
		"https://airportbusexpress.it.evil.example/tickets",
		"https://user:password@www.airportbusexpress.it/tickets",
		"https://www.google.com/url?url=https%3A%2F%2Fevil.example%2Fsteal",
		"https://www.google.com/url?redirect_uri=http%3A%2F%2Fwww.airportbusexpress.it",
		"https://www.google.com/url?URL=https%3A%2F%2Fevil.example%2Fsteal",
		"https://www.google.com/url?url=https%3A%2F%2Fwww.airportbusexpress.it&url=https%3A%2F%2Fevil.example",
	])("rejects unsafe or redirect-escaping URL %s", (input) => {
		expect(sanitizeJourneyExternalUrl(input)).toBeNull();
	});
});
