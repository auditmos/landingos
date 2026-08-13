// @vitest-environment jsdom

import type { PrivateDestination } from "@repo/data-ops/destination";
import type { FlightInstance } from "@repo/data-ops/flight";
import type { JourneyRecommendationResult, JourneyVariant } from "@repo/data-ops/journey";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JourneyPlanner, JourneyVariantCard } from "@/components/journey/journey-planner";
import {
	formatJourneyCost,
	type JourneyApiError,
	journeyNavigationUrl,
	recommendJourneysApi,
} from "./journey-planner";

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

const baseVariant: JourneyVariant = {
	id: "journey-1",
	badges: ["recommended", "fastest"],
	durationMinutes: 65,
	arrivalTimeUtc: "2026-09-14T10:10:00.000Z",
	cost: {
		currency: "EUR",
		minorMin: 1_000,
		minorMax: 1_200,
		completeness: "partial",
	},
	transferCount: 1,
	walkingMinutes: 8,
	walkingMeters: 600,
	steps: [
		{
			mode: "bus",
			from: "Aeroporto BGY",
			to: "Milano Centrale",
			durationMinutes: 50,
			walkingMeters: 0,
		},
		{
			mode: "walk",
			from: "Milano Centrale",
			to: "Cel podróży",
			durationMinutes: 8,
			walkingMeters: 600,
		},
	],
	sourceReferences: [
		{
			kind: "provider",
			label: "Fixture Transit",
			url: null,
			checkedAt: null,
		},
		{
			kind: "catalog",
			label: "Airport Bus Express",
			url: "https://www.milanbergamoairport.it/en/bus/",
			checkedAt: "2026-07-27T00:00:00.000Z",
		},
	],
	manualVerification: {
		checkedAt: "2026-07-27T00:00:00.000Z",
		freshness: "fresh",
	},
	externalLinks: [
		{
			kind: "purchase",
			label: "Sprawdź u Airport Bus Express",
			url: "https://www.airportbusexpress.it/tickets",
		},
	],
};

const recommendations: JourneyRecommendationResult = {
	status: "recommendations",
	variants: [baseVariant],
	explanation: "Znaleźliśmy tylko jedną unikalną i wiarygodną trasę.",
};

function setInputValue(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("journey card contract", () => {
	it("renders all normalized fields, ordered steps, sources, verification, and external link", () => {
		const html = renderToStaticMarkup(createElement(JourneyVariantCard, { variant: baseVariant }));
		for (const expected of [
			"Rekomendowana",
			"Najszybsza",
			"65 min",
			"Przesiadki",
			"1",
			"8 min",
			"600 m",
			"1. Autobus",
			"2. Pieszo",
			"Fixture Transit",
			"Airport Bus Express",
			"Dane ręczne zweryfikowano",
			"Sprawdź u Airport Bus Express",
		]) {
			expect(html).toContain(expected);
		}
		expect(html.indexOf("1. Autobus")).toBeLessThan(html.indexOf("2. Pieszo"));
		expect(html).toContain('target="_blank"');
		expect(html).toContain('rel="noopener noreferrer"');
	});

	it("keeps complete, partial, unknown, fresh manual, and stale manual states distinct", () => {
		const complete = formatJourneyCost({
			currency: "EUR",
			minorMin: 1_000,
			minorMax: 1_000,
			completeness: "complete",
		});
		const partialOpen = formatJourneyCost({
			currency: "EUR",
			minorMin: 1_000,
			minorMax: null,
			completeness: "partial",
		});
		const partialRange = formatJourneyCost(baseVariant.cost);
		const unknown = formatJourneyCost({
			currency: "EUR",
			minorMin: null,
			minorMax: null,
			completeness: "unknown",
		});

		expect(complete).not.toContain("niegwarantowana");
		expect(partialOpen).toContain("od");
		expect(partialOpen).toContain("niegwarantowana");
		expect(partialRange).toContain("zakres");
		expect(partialRange).toContain("niegwarantowana");
		expect(unknown).toBe("Brak pełnej ceny");
		expect(new Set([complete, partialOpen, partialRange, unknown]).size).toBe(4);

		const freshHtml = renderToStaticMarkup(
			createElement(JourneyVariantCard, { variant: baseVariant }),
		);
		const completeHtml = renderToStaticMarkup(
			createElement(JourneyVariantCard, {
				variant: {
					...baseVariant,
					cost: {
						currency: "EUR",
						minorMin: 1_000,
						minorMax: 1_000,
						completeness: "complete",
					},
					manualVerification: null,
				},
			}),
		);
		const partialHtml = renderToStaticMarkup(
			createElement(JourneyVariantCard, {
				variant: {
					...baseVariant,
					manualVerification: null,
				},
			}),
		);
		const unknownHtml = renderToStaticMarkup(
			createElement(JourneyVariantCard, {
				variant: {
					...baseVariant,
					cost: {
						currency: "EUR",
						minorMin: null,
						minorMax: null,
						completeness: "unknown",
					},
					manualVerification: null,
				},
			}),
		);
		const staleHtml = renderToStaticMarkup(
			createElement(JourneyVariantCard, {
				variant: {
					...baseVariant,
					manualVerification: {
						checkedAt: "2026-05-01T00:00:00.000Z",
						freshness: "stale",
					},
				},
			}),
		);
		expect(freshHtml).toContain("Dane ręczne zweryfikowano");
		expect(freshHtml).not.toContain("nieaktualne");
		expect(completeHtml).toContain("Kompletność ceny: pełna");
		expect(partialHtml).toContain("Kompletność ceny: częściowa");
		expect(unknownHtml).toContain("Kompletność ceny: nieznana");
		expect(unknownHtml).toContain("Brak pełnej ceny");
		expect(staleHtml).toContain("Dane ręczne są nieaktualne");
	});

	it("collapses steps and sources behind a details section and leads with the Maps link", () => {
		const mapsUrl = journeyNavigationUrl(destination.coordinates);
		const html = renderToStaticMarkup(
			createElement(JourneyVariantCard, { variant: baseVariant, mapsUrl }),
		);
		expect(mapsUrl).toBe(
			"https://www.google.com/maps/dir/?api=1&origin=45.673889,9.704167&destination=45.464098,9.191926&travelmode=transit",
		);
		expect(html).toContain("Nawiguj w Mapach Google");
		expect(html).toContain("<details");
		expect(html).toContain("Etapy trasy i źródła (2)");
		expect(html.indexOf("<details")).toBeLessThan(html.indexOf("1. Autobus"));
		expect(html.indexOf("<details")).toBeLessThan(html.indexOf("Fixture Transit"));
		expect(html.indexOf("Nawiguj w Mapach Google")).toBeLessThan(html.indexOf("<details"));
	});
});

describe("journey API boundary", () => {
	it.each([
		[429, "rate_limited"],
		[500, "provider_error"],
	] as const)("maps HTTP %i to the controlled %s outcome", async (status, reason) => {
		await expect(
			recommendJourneysApi(
				{
					flightInstanceId: flight.id,
					scheduledArrivalUtc: flight.scheduledArrivalUtc,
					privateDestinationCoordinates: destination.coordinates,
					bufferMinutes: 45,
				},
				undefined,
				vi.fn(async () => new Response("fault", { status })),
			),
		).rejects.toMatchObject({ name: "JourneyApiError", reason });
	});

	it("treats malformed provider output as incomplete", async () => {
		await expect(
			recommendJourneysApi(
				{
					flightInstanceId: flight.id,
					scheduledArrivalUtc: flight.scheduledArrivalUtc,
					privateDestinationCoordinates: destination.coordinates,
					bufferMinutes: 45,
				},
				undefined,
				vi.fn(async () => Response.json({ status: "recommendations", variants: [] })),
			),
		).rejects.toEqual(
			expect.objectContaining<Partial<JourneyApiError>>({
				name: "JourneyApiError",
				reason: "incomplete",
			}),
		);
	});
});

describe("interactive journey planner", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	});

	it("queries +45 by default and recomputes each valid edge change exactly once", async () => {
		const requests: Array<Record<string, unknown>> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				requests.push(JSON.parse(String(init?.body)));
				return Response.json(recommendations);
			}),
		);

		await act(async () => {
			root.render(createElement(JourneyPlanner, { flight, destination }));
		});
		expect(requests.map((request) => request.bufferMinutes)).toEqual([45]);
		expect(container.textContent).toContain("Dołączasz do pokoju FR 1234 · 14.09.2026");
		const range = container.querySelector<HTMLInputElement>("#journey-buffer");
		expect(range).toMatchObject({ min: "15", max: "180", step: "5" });

		await act(async () => setInputValue(range as HTMLInputElement, "15"));
		await act(async () => setInputValue(range as HTMLInputElement, "180"));
		expect(requests.map((request) => request.bufferMinutes)).toEqual([45, 15, 180]);
		expect(requests).toHaveLength(3);
	});

	it.each([
		["no_trustworthy_route", "zero_result", "Nie znaleźliśmy wiarygodnej trasy"],
		["no_trustworthy_route", "no_post_arrival_route", "Dostępne wyniki odjeżdżają przed końcem"],
		["no_trustworthy_route", "no_complete_itinerary", "Dostępne dane nie tworzą kompletnej trasy"],
		["recommendation_unavailable", "timeout", "nie odpowiedział na czas"],
		["recommendation_unavailable", "rate_limited", "chwilowo przeciążony"],
		["recommendation_unavailable", "provider_error", "chwilowo niedostępny"],
		["recommendation_unavailable", "incomplete", "niepełne lub nieprawidłowe"],
	] as const)("ends loading for %s/%s with retry, change, and manual alternatives", async (status, reason, copy) => {
		const result = {
			status,
			reason,
			manualAlternatives: [
				{
					kind: "source" as const,
					label: "Sprawdź połączenia ręcznie",
					url: "https://www.milanbergamoairport.it/en/bus/",
				},
			],
			catalogAlternatives: [],
		} as JourneyRecommendationResult;
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json(result)),
		);

		await act(async () => {
			root.render(createElement(JourneyPlanner, { flight, destination }));
		});
		expect(container.textContent).not.toContain("Przygotowujemy warianty");
		expect(container.textContent).toContain(copy);
		expect(container.textContent).toContain("Spróbuj ponownie");
		expect(container.textContent).toContain("Zmień parametry");
		expect(container.textContent).toContain("Alternatywy ręczne");
	});

	it.each([
		["HTTP 429", () => new Response("fault", { status: 429 }), "chwilowo przeciążony"],
		["HTTP 500", () => new Response("fault", { status: 500 }), "chwilowo niedostępny"],
		[
			"malformed",
			() => Response.json({ status: "recommendations", variants: [] }),
			"niepełne lub nieprawidłowe",
		],
	] as const)("ends loading for %s with the allowlisted manual fallback", async (_name, reply, copy) => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => reply()),
		);

		await act(async () => {
			root.render(createElement(JourneyPlanner, { flight, destination }));
		});
		expect(container.textContent).not.toContain("Przygotowujemy warianty");
		expect(container.textContent).toContain(copy);
		expect(container.textContent).toContain("Spróbuj ponownie");
		expect(container.textContent).toContain("Zmień parametry");
		const link = container.querySelector<HTMLAnchorElement>(
			'a[href="https://www.milanbergamoairport.it/en/bus/"]',
		);
		expect(link).not.toBeNull();
	});

	it("shows one detailed card at a time behind a compact variant picker", async () => {
		const simplest: JourneyVariant = {
			...baseVariant,
			id: "journey-2",
			badges: ["simplest"],
			durationMinutes: 82,
			transferCount: 0,
			steps: [
				{
					mode: "bus",
					from: "Aeroporto BGY",
					to: "Porta Garibaldi",
					durationMinutes: 74,
					walkingMeters: 0,
				},
			],
			externalLinks: [],
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json({
					status: "recommendations",
					variants: [simplest, baseVariant],
					explanation: "Dwa warianty do porównania.",
				}),
			),
		);

		await act(async () => {
			root.render(createElement(JourneyPlanner, { flight, destination }));
		});

		const pickerButtons = container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]");
		expect(pickerButtons).toHaveLength(2);
		// The recommended variant is preselected even when the provider lists it second.
		expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toContain("65 min");
		expect(container.querySelectorAll("details")).toHaveLength(1);
		expect(container.textContent).not.toContain("Porta Garibaldi");

		const simplestButton = Array.from(pickerButtons).find((button) =>
			button.textContent?.includes("Najprostsza"),
		);
		expect(simplestButton).toBeDefined();
		await act(async () => simplestButton?.click());
		expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toContain("82 min");
		expect(container.querySelectorAll("details")).toHaveLength(1);
		expect(container.textContent).toContain("Porta Garibaldi");
	});
});
