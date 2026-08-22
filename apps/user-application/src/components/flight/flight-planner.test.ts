// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { FlightPlanner } from "./flight-planner";
import { PlannerResults } from "./flight-planner-results";

/*
 * Issue #16 assumptions approved before RED:
 * - input: a normalized manual_required result always carries the entered designator/date;
 * - output: provider fallback contributes no arrival value, suggestion, or hidden default;
 * - confirmation: entering a valid local arrival and submitting is the explicit confirmation;
 * - boundary: every new manual result starts empty, including retries and a different flight/date;
 * - excluded here: measured live-provider recognition and commercial/provider suitability.
 */

function setInputValue(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function settle() {
	await act(async () => {
		await Promise.resolve();
	});
}

describe("FlightPlanner manual fallback", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
		vi.unstubAllGlobals();
	});

	it("requires the traveler to enter an arrival after provider fallback", async () => {
		const fetchSpy = vi.fn(async () =>
			Response.json({
				status: "manual_required",
				reason: "not_found",
				flightNumber: "W61431",
				departureLocalDate: "2026-09-16",
			}),
		);
		vi.stubGlobal("fetch", fetchSpy);
		await act(async () => root.render(createElement(FlightPlanner)));

		const flightNumber = container.querySelector<HTMLInputElement>("#flight-number");
		const departureDate = container.querySelector<HTMLInputElement>("#departure-date-native");
		await act(async () => {
			setInputValue(flightNumber as HTMLInputElement, "W61431");
			setInputValue(departureDate as HTMLInputElement, "2026-09-16");
			flightNumber?.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		});
		await settle();

		const arrival = container.querySelector<HTMLInputElement>("#arrival-native");
		const manualSubmit = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.includes("Zapisz i kontynuuj"),
		);
		expect(arrival?.value).toBe("");
		expect(manualSubmit?.disabled).toBe(true);
		expect(container.textContent).toContain("Nie otrzymaliśmy godziny przylotu od dostawcy");
		expect(container.textContent).not.toContain("12:00");
		expect(fetchSpy).toHaveBeenCalledOnce();
	});

	it("accepts a typed Polish date-time as the manual arrival when the native picker is unusable", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json({
					status: "manual_required",
					reason: "not_found",
					flightNumber: "W61431",
					departureLocalDate: "2026-09-16",
				}),
			),
		);
		await act(async () => root.render(createElement(FlightPlanner)));
		const flightNumber = container.querySelector<HTMLInputElement>("#flight-number");
		await act(async () => {
			setInputValue(flightNumber as HTMLInputElement, "W61431");
			flightNumber?.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		});
		await settle();

		const typed = container.querySelector<HTMLInputElement>("#arrival-typed");
		const native = container.querySelector<HTMLInputElement>("#arrival-native");
		const manualSubmit = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.includes("Zapisz i kontynuuj"),
		);
		expect(typed?.placeholder).toBe("DD.MM.RRRR, GG:MM");
		expect(native?.getAttribute("aria-hidden")).toBeNull();
		expect(manualSubmit?.disabled).toBe(true);

		await act(async () => setInputValue(typed as HTMLInputElement, "16.09.2026, 14:30"));
		expect(native?.value).toBe("2026-09-16T14:30");
		expect(manualSubmit?.disabled).toBe(false);

		await act(async () => setInputValue(typed as HTMLInputElement, "16.09.2026, 25:30"));
		expect(native?.value).toBe("2026-09-16T14:30");
	});

	it("previews and normalizes a pasted designator without a hard input mask", async () => {
		await act(async () => root.render(createElement(FlightPlanner)));
		const input = container.querySelector<HTMLInputElement>("#flight-number");
		expect(input?.placeholder).toBe("W6 1431 lub FR1234");
		expect(input?.getAttribute("autocapitalize")).toBe("characters");
		expect(input?.getAttribute("spellcheck")).toBe("false");
		expect(input?.maxLength).toBe(16);

		await act(async () => setInputValue(input as HTMLInputElement, "w6-1431"));
		expect(container.textContent).toContain("Rozpoznamy jako W61431");
		expect(input?.value).toBe("w6-1431");

		await act(async () => input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
		expect(input?.value).toBe("W61431");
	});

	it.each([
		["FR12/34", "Podaj jeden numer lotu z biletu, np. W6 1431 lub FR1234."],
		[
			"EZY123",
			"To wygląda jak trzy-literowy kod operacyjny. Podaj numer marketingowy z biletu lub karty pokładowej, np. W6 1431.",
		],
	] as const)("shows specific guidance for %s and makes zero provider calls", async (value, copy) => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		await act(async () => root.render(createElement(FlightPlanner)));
		const flightNumber = container.querySelector<HTMLInputElement>("#flight-number");
		const departureDate = container.querySelector<HTMLInputElement>("#departure-date-native");

		await act(async () => {
			setInputValue(flightNumber as HTMLInputElement, value);
			setInputValue(departureDate as HTMLInputElement, "2026-09-16");
			flightNumber?.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		});

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(container.textContent).toContain(copy);
		expect(flightNumber?.getAttribute("aria-invalid")).toBe("true");
		expect(flightNumber?.getAttribute("aria-describedby")).toContain("flight-number-error");
	});

	it("uses the traveler-entered arrival as the explicit manual confirmation", async () => {
		const fetchSpy = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				Response.json({
					status: "manual_required",
					reason: "not_found",
					flightNumber: "W61431",
					departureLocalDate: "2026-09-16",
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					status: "recognized",
					flight: {
						id: "manual-flight-id",
						marketingCarrierCode: "W6",
						marketingCarrierName: "W6",
						marketingFlightNumber: "1431",
						operatingCarrierCode: null,
						operatingFlightNumber: null,
						departureLocalDate: "2026-09-16",
						originIata: "ZZZ",
						destinationIata: "BGY",
						scheduledArrivalUtc: "2026-09-16T08:30:00.000Z",
						displayTimezone: "Europe/Rome",
						source: "manual",
					},
				}),
			);
		vi.stubGlobal("fetch", fetchSpy);
		await act(async () => root.render(createElement(FlightPlanner)));

		const flightNumber = container.querySelector<HTMLInputElement>("#flight-number");
		const departureDate = container.querySelector<HTMLInputElement>("#departure-date-native");
		await act(async () => {
			setInputValue(flightNumber as HTMLInputElement, "W61431");
			setInputValue(departureDate as HTMLInputElement, "2026-09-16");
			flightNumber?.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		});
		await settle();

		const arrival = container.querySelector<HTMLInputElement>("#arrival-native");
		await act(async () => setInputValue(arrival as HTMLInputElement, "2026-09-16T10:30"));
		const manualSubmit = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.includes("Zapisz i kontynuuj"),
		);
		expect(manualSubmit?.disabled).toBe(false);
		await act(async () => {
			manualSubmit?.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		});
		await settle();

		expect(fetchSpy).toHaveBeenCalledTimes(2);
		const manualCall = fetchSpy.mock.calls[1];
		expect(new URL(String(manualCall?.[0])).pathname).toBe("/flights/manual");
		expect(JSON.parse(String(manualCall?.[1]?.body))).toEqual({
			flightNumber: "W61431",
			departureLocalDate: "2026-09-16",
			destinationIata: "BGY",
			scheduledArrivalUtc: "2026-09-16T08:30:00.000Z",
		});
		expect(container.textContent).toContain("Lot rozpoznany");
	});

	it.each([
		["not_found", "Nie znaleźliśmy tego lotu. Sprawdź numer i datę albo wpisz przylot ręcznie."],
		[
			"timeout",
			"Dostawca danych nie odpowiedział na czas. Spróbuj ponownie albo wpisz przylot ręcznie.",
		],
		[
			"rate_limited",
			"Dostawca danych jest chwilowo przeciążony. Odczekaj chwilę i spróbuj ponownie albo wpisz przylot ręcznie.",
		],
		[
			"provider_error",
			"Dostawca danych jest chwilowo niedostępny. Spróbuj ponownie później albo wpisz przylot ręcznie.",
		],
		["incomplete", "Dane lotu są niepełne. Sprawdź dane na bilecie i wpisz przylot ręcznie."],
	] as const)("renders actionable Polish copy for %s and preserves input", (reason, copy) => {
		const html = renderToStaticMarkup(
			createElement(PlannerResults, {
				error: "",
				result: {
					status: "manual_required",
					reason,
					flightNumber: "W61431",
					departureLocalDate: "2026-09-16",
				},
				manualArrival: "",
				manualArrivalError: "",
				loading: false,
				onManualArrivalChange: () => undefined,
				onManualSubmit: () => undefined,
				onRetry: () => undefined,
				onDestinationChange: () => undefined,
			}),
		);

		expect(html).toContain(copy);
		expect(html).toContain("W61431");
		expect(html).toContain("16.09.2026");
		expect(html).not.toContain("12:00");
	});

	it("shows the shared first arrival when a later manual entry conflicts", () => {
		const html = renderToStaticMarkup(
			createElement(PlannerResults, {
				error: "",
				result: {
					status: "recognized",
					flight: {
						id: "manual-flight-id",
						marketingCarrierCode: "W6",
						marketingCarrierName: "W6",
						marketingFlightNumber: "1431",
						operatingCarrierCode: null,
						operatingFlightNumber: null,
						departureLocalDate: "2026-08-11",
						originIata: "ZZZ",
						destinationIata: "BGY",
						scheduledArrivalUtc: "2026-08-11T08:20:00.000Z",
						displayTimezone: "Europe/Rome",
						source: "manual",
					},
					manualArrivalConflict: {
						requestedScheduledArrivalUtc: "2026-08-11T08:37:00.000Z",
						sharedScheduledArrivalUtc: "2026-08-11T08:20:00.000Z",
					},
				},
				manualArrival: "",
				manualArrivalError: "",
				loading: false,
				onManualArrivalChange: () => undefined,
				onManualSubmit: () => undefined,
				onRetry: () => undefined,
				onDestinationChange: () => undefined,
			}),
		);

		expect(html).toContain("W6 1431");
		expect(html).not.toContain("W6 W61431");
		expect(html).toContain("Korzystamy ze wspólnej godziny przylotu");
		expect(html).toContain("11.08.2026, 10:20");
		expect(html).toContain("podana przez podróżnych");
	});
});
