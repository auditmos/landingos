// @vitest-environment jsdom

import type { PrivateDestination } from "@repo/data-ops/destination";
import type { FlightInstance } from "@repo/data-ops/flight";
import { APPROVED_JOURNEY_EXTERNAL_HOSTS } from "@repo/data-ops/journey";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JourneyPlanner } from "./journey-planner";

/*
 * Issue #21: on a provider failure the traveler may see a published catalog entry,
 * clearly framed as a manually verified BGY → stop transfer — never as a ranked route
 * that reaches the private destination.
 */

const flight: FlightInstance = {
	id: "flight-id",
	marketingCarrierCode: "FR",
	marketingCarrierName: "Ryanair",
	marketingFlightNumber: "1234",
	operatingCarrierCode: "FR",
	operatingFlightNumber: "1234",
	departureLocalDate: "2026-09-14",
	originIata: "WAW",
	destinationIata: "BGY",
	scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
	displayTimezone: "Europe/Rome",
	source: "provider",
};

const destination: PrivateDestination = {
	placeId: "private-place-id",
	displayName: "Duomo di Milano",
	coordinates: { latitude: 45.464098, longitude: 9.191926 },
	supportedAreaVersion: "milan-municipality-v1",
};

const failureBody = {
	status: "recommendation_unavailable",
	reason: "provider_error",
	manualAlternatives: [
		{
			kind: "purchase",
			label: "Sprawdź u Terravision",
			url: "https://www.terravision.eu/airport_transfer/",
		},
	],
	catalogAlternatives: [
		{
			id: "catalog-1",
			kind: "manually_verified_transfer",
			operatorName: "Terravision",
			serviceName: "BGY → Milano Centrale",
			destinationStopCode: "milano-centrale",
			destinationStopName: "Milano Centrale",
			durationMinutes: 60,
			transferCount: 1,
			walkingMinutes: 7,
			walkingMeters: 420,
			cost: { currency: "EUR", minorMin: 1_000, minorMax: 1_200, completeness: "partial" },
			source: {
				kind: "catalog",
				label: "Terravision · BGY → Milano Centrale",
				url: "https://www.milanbergamoairport.it/en/bus/",
				checkedAt: "2026-08-01T00:00:00.000Z",
			},
			freshness: "fresh",
			purchaseLink: {
				kind: "purchase",
				label: "Sprawdź u Terravision",
				url: "https://www.terravision.eu/airport_transfer/",
			},
		},
	],
};

describe("catalog transfer alternative", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(async () => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json(failureBody)),
		);
		await act(async () => root.render(createElement(JourneyPlanner, { flight, destination })));
		await act(async () => {
			await Promise.resolve();
		});
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
		vi.unstubAllGlobals();
	});

	it("renders every manually verified transfer fact", () => {
		const text = container.textContent ?? "";
		expect(text).toContain("Terravision");
		expect(text).toContain("BGY → Milano Centrale");
		expect(text).toContain("Milano Centrale");
		expect(text).toContain("60 min");
		expect(text).toContain("1");
		expect(text).toContain("7 min");
		expect(text).toContain("420 m");
		expect(text).toMatch(/10,00/);
		expect(text).toMatch(/\b1\.08\.2026\b/);
	});

	it("frames the entry as a verified transfer, not an end-to-end recommendation", () => {
		const text = container.textContent ?? "";
		expect(text).toContain("Ręcznie zweryfikowany przejazd z BGY");
		expect(text).toContain("To nie jest trasa pod Twój adres");
		expect(text).not.toContain("Rekomendowana");
		expect(text).not.toContain("Najszybsza");
		expect(text).not.toContain("Najprostsza");
		expect(text).not.toContain("Przyjazd około");
	});

	it("keeps every external link HTTPS, allowlisted, and safely targeted", () => {
		const links = [...container.querySelectorAll("a")];
		expect(links.length).toBeGreaterThan(0);
		for (const link of links) {
			const url = new URL(link.href);
			expect(url.protocol).toBe("https:");
			expect(APPROVED_JOURNEY_EXTERNAL_HOSTS as readonly string[]).toContain(url.host);
			expect(link.rel.split(/\s+/)).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
			expect(link.target).toBe("_blank");
		}
	});

	it("never offers a payment or ticket-purchase flow of its own", () => {
		const text = container.textContent ?? "";
		expect(text).not.toMatch(/zapłać|płatnoś|koszyk|kup bilet w LandingOS|karta płatnicza/i);
		expect(container.querySelectorAll("form")).toHaveLength(0);
		expect(container.querySelector("input[type='password']")).toBeNull();
	});

	it("never leaks the private destination into the alternative", () => {
		const html = container.innerHTML;
		expect(html).not.toContain("private-place-id");
		expect(html).not.toContain("Duomo di Milano");
		expect(html).not.toContain("45.464098");
	});
});
