// @vitest-environment jsdom

import type { PrivateDestination } from "@repo/data-ops/destination";
import type { FlightInstance } from "@repo/data-ops/flight";
import type { CatalogTransferAlternative, JourneyVariant } from "@repo/data-ops/journey";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JourneyPlanner, JourneyVariantCard } from "./journey-planner";

/*
 * Issue #51: `checkedAt` is nullable on every journey source reference. Both render
 * sites must drop the whole "sprawdzono <data>" clause when it is null — never render
 * `new Date(null ?? "")`, which formats as the English literal "Invalid Date".
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

const alternative: CatalogTransferAlternative = {
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
		checkedAt: null,
	},
	freshness: "fresh",
	purchaseLink: null,
};

const variant: JourneyVariant = {
	id: "variant-1",
	badges: ["recommended"],
	durationMinutes: 65,
	arrivalTimeUtc: "2026-09-14T10:30:00.000Z",
	cost: { currency: "EUR", minorMin: 1_000, minorMax: 1_000, completeness: "complete" },
	transferCount: 1,
	walkingMinutes: 8,
	walkingMeters: 600,
	steps: [
		{ mode: "bus", from: "BGY", to: "Milano Centrale", durationMinutes: 60, walkingMeters: 0 },
	],
	sourceReferences: [
		{ kind: "provider", label: "Rozkład przewoźnika", url: null, checkedAt: null },
	],
	manualVerification: null,
	externalLinks: [],
};

let container: HTMLDivElement;
let root: Root;

async function render(element: ReturnType<typeof createElement>): Promise<string> {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	await act(async () => root.render(element));
	await act(async () => {
		await Promise.resolve();
	});
	return container.textContent ?? "";
}

async function renderAlternative(next: CatalogTransferAlternative): Promise<string> {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () =>
			Response.json({
				status: "recommendation_unavailable",
				reason: "provider_error",
				manualAlternatives: [],
				catalogAlternatives: [next],
			}),
		),
	);
	return render(createElement(JourneyPlanner, { flight, destination }));
}

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
	vi.unstubAllGlobals();
});

describe("catalog alternative source freshness", () => {
	it("drops the whole sprawdzono clause when the source was never checked", async () => {
		const text = await renderAlternative(alternative);
		expect(text).toContain("Terravision");
		expect(text).not.toContain("Invalid Date");
		expect(text).not.toContain("sprawdzono");
		expect(text).not.toContain("nieaktualne");
	});

	it("keeps the stale warning but no date when a stale source was never checked", async () => {
		const text = await renderAlternative({ ...alternative, freshness: "stale" });
		expect(text).toContain("dane nieaktualne");
		expect(text).not.toContain("Invalid Date");
		expect(text).not.toContain("sprawdzono");
	});

	it("renders the pl-PL date when the source was checked", async () => {
		const text = await renderAlternative({
			...alternative,
			source: { ...alternative.source, checkedAt: "2026-08-01T00:00:00.000Z" },
		});
		expect(text).toContain("sprawdzono 1.08.2026");
		expect(text).not.toContain("Invalid Date");
	});

	it("keeps the dane nieaktualne prefix ahead of the date for a stale source", async () => {
		const text = await renderAlternative({
			...alternative,
			freshness: "stale",
			source: { ...alternative.source, checkedAt: "2026-08-01T00:00:00.000Z" },
		});
		expect(text).toContain("dane nieaktualne, sprawdzono 1.08.2026");
		expect(text).not.toContain("Invalid Date");
	});
});

describe("variant source references freshness", () => {
	it("drops the whole sprawdzono clause when a source was never checked", async () => {
		const text = await render(createElement(JourneyVariantCard, { variant }));
		expect(text).toContain("Rozkład przewoźnika");
		expect(text).not.toContain("Invalid Date");
		expect(text).not.toContain("sprawdzono");
	});

	it("renders the pl-PL date when a source was checked", async () => {
		const text = await render(
			createElement(JourneyVariantCard, {
				variant: {
					...variant,
					sourceReferences: [
						{
							kind: "provider",
							label: "Rozkład przewoźnika",
							url: null,
							checkedAt: "2026-08-01T00:00:00.000Z",
						},
					],
				},
			}),
		);
		expect(text).toContain("sprawdzono 1.08.2026");
		expect(text).not.toContain("Invalid Date");
	});
});
