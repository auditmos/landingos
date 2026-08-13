// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { FlightPlanner } from "./flight-planner";
import { PlannerResults } from "./flight-planner-results";

function setInputValue(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("FlightPlanner designator input", () => {
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
