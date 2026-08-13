import { APPROVED_JOURNEY_EXTERNAL_HOSTS, inspectJourneyExternalUrl } from "./external-links";

// Issue #18 assumptions before RED:
// - Input is one absolute URL string; successful validation preserves it verbatim.
// - The exact hostname is the trust boundary; paths remain unrestricted for carrier booking flows.
// - Errors are Polish, field-ready, and distinguish HTTPS, credentials, hostname, and redirects.
// - This slice intentionally does not verify or interact with payment pages on external sites.
describe("journey external URL contract", () => {
	it("allows the reviewed FlixBus and Terravision BGY to Milan pages", () => {
		for (const url of [
			"https://www.flixbus.com/bus-routes/bus-bergamo-orio-al-serio-airport-milan",
			"https://www.terravision.eu/airport_transfer/bus-bergamo-airport-milan/",
		]) {
			expect(inspectJourneyExternalUrl(url)).toEqual({ ok: true, url });
		}
		expect(APPROVED_JOURNEY_EXTERNAL_HOSTS).toEqual(
			expect.arrayContaining(["www.flixbus.com", "www.terravision.eu"]),
		);
	});

	it.each([
		[
			"http://www.flixbus.com/bus-routes/bus-bergamo-orio-al-serio-airport-milan",
			"https_required",
			"Adres musi używać protokołu HTTPS.",
		],
		[
			"https://operator:secret@www.terravision.eu/airport_transfer/bus-bergamo-airport-milan/",
			"credentials_not_allowed",
			"Adres nie może zawierać nazwy użytkownika ani hasła.",
		],
		[
			"https://www.flixbus.com.evil.example/tickets",
			"hostname_not_approved",
			"Host „www.flixbus.com.evil.example” nie jest zatwierdzony.",
		],
		[
			"https://www.google.com/url?url=https%3A%2F%2Fevil.example%2Fsteal",
			"unsafe_redirect",
			"Adres zawiera niebezpieczne przekierowanie poza zatwierdzoną listę.",
		],
	] as const)("reports why the external URL is unsafe: %s", (url, reason, message) => {
		expect(inspectJourneyExternalUrl(url)).toMatchObject({ ok: false, reason, message });
	});
});
