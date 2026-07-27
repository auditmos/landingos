// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DestinationPlanner } from "@/components/destination/destination-planner";
import { FlightPlanner } from "@/components/flight/flight-planner";

function setInputValue(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("anonymous flight-to-destination flow", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal("crypto", { randomUUID: () => "planner-session-123456" });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("retains flight and typed destination after an unsupported result and never calls routing", async () => {
		const requestedPaths: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const path = new URL(String(input)).pathname;
				requestedPaths.push(path);
				if (path === "/flights/resolve") {
					return Response.json({
						status: "recognized",
						flight: {
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
						},
					});
				}
				if (path === "/destinations/autocomplete") {
					return Response.json({
						status: "suggestions",
						predictions: [
							{
								placeId: "fixture:place:bgy",
								primaryText: "Lotnisko Mediolan-Bergamo",
								secondaryText: "Orio al Serio, Bergamo",
							},
						],
					});
				}
				if (path === "/destinations/select") {
					return Response.json({
						status: "destination_not_supported",
						supportedAreaVersion: "milan-municipality-v1",
					});
				}
				throw new Error(`Unexpected request: ${path}`);
			}),
		);

		await act(async () => root.render(createElement(FlightPlanner)));
		const flightNumber = container.querySelector<HTMLInputElement>("#flight-number");
		const departureDate = container.querySelector<HTMLInputElement>("#departure-date");
		expect(flightNumber).not.toBeNull();
		expect(departureDate).not.toBeNull();
		await act(async () => {
			setInputValue(flightNumber as HTMLInputElement, "FR1234");
			setInputValue(departureDate as HTMLInputElement, "2026-09-14");
		});
		await act(async () => {
			container
				.querySelector<HTMLFormElement>("form")
				?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
			await Promise.resolve();
		});

		expect(container.textContent).toContain("Ryanair FR1234");
		const destinationInput = container.querySelector<HTMLInputElement>("#destination-query");
		expect(destinationInput).not.toBeNull();
		await act(async () => {
			setInputValue(destinationInput as HTMLInputElement, "Lotnisko BGY");
			await vi.advanceTimersByTimeAsync(250);
		});
		const predictionButton = Array.from(container.querySelectorAll("button")).find((button) =>
			button.textContent?.includes("Lotnisko Mediolan-Bergamo"),
		);
		expect(predictionButton).toBeDefined();
		await act(async () => {
			predictionButton?.click();
			await Promise.resolve();
		});

		expect(container.textContent).toContain("Cel jeszcze nieobsługiwany");
		expect(container.textContent).toContain("Ryanair FR1234");
		expect(destinationInput?.value).toBe("Lotnisko BGY");
		expect(requestedPaths.filter((path) => path.includes("route"))).toEqual([]);
	});

	it.each([
		["not_found", "Nie znaleźliśmy pasującego miejsca"],
		["timeout", "Wyszukiwanie nie odpowiedziało na czas"],
		["rate_limited", "Wyszukiwanie jest chwilowo przeciążone"],
		["provider_error", "Wyszukiwanie jest chwilowo niedostępne"],
		["incomplete", "Dane miejsca są niepełne"],
	] as const)("ends loading for %s and offers Polish retry/change actions", async (reason, copy) => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json({
					status: "autocomplete_unavailable",
					reason,
				}),
			),
		);
		await act(async () => root.render(createElement(DestinationPlanner)));
		const destinationInput = container.querySelector<HTMLInputElement>("#destination-query");
		await act(async () => {
			setInputValue(destinationInput as HTMLInputElement, "Duomo");
			await vi.advanceTimersByTimeAsync(250);
		});
		expect(container.textContent).not.toContain("Szukamy miejsca…");
		expect(container.textContent).toContain(copy);
		expect(container.textContent).toContain("Spróbuj ponownie");
		expect(container.textContent).toContain("Zmień wpisane miejsce");
	});
});
