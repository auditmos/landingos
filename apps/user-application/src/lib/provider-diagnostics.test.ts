// @vitest-environment jsdom

import type { ProviderDiagnostic } from "@repo/data-ops/diagnostics";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { DestinationPlanner } from "@/components/destination/destination-planner";
import { PlannerResults } from "@/components/flight/flight-planner-results";
import { JourneyPlanner } from "@/components/journey/journey-planner";
import {
	destinationOutcomeGuidance,
	flightOutcomeGuidance,
	journeyOutcomeGuidance,
	MVP_PROVIDER_LIMIT_NOTICE,
	providerCategoryCopy,
	providerClassCopy,
	providerRecoveryCopy,
} from "./provider-diagnostics";

const detailedDiagnostic: ProviderDiagnostic = {
	reference: "cf-ray-abc123",
	occurredAtUtc: "2026-08-13T09:15:30.000Z",
	recovery: "manual",
	providerClass: "lot",
	category: "plan_restricted",
};

const minimalDiagnostic: ProviderDiagnostic = {
	reference: "cf-ray-abc123",
	occurredAtUtc: "2026-08-13T09:15:30.000Z",
	recovery: "manual",
};

function plannerMarkup(diagnostic?: ProviderDiagnostic): string {
	return renderToStaticMarkup(
		createElement(PlannerResults, {
			error: "",
			result: {
				status: "manual_required",
				reason: "provider_error",
				flightNumber: "W61431",
				departureLocalDate: "2026-09-16",
				...(diagnostic ? { diagnostic } : {}),
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
}

describe("provider diagnostic copy", () => {
	it("names every normalized category in Polish", () => {
		expect(Object.keys(providerCategoryCopy).sort()).toEqual([
			"access_configuration",
			"malformed_response",
			"plan_restricted",
			"provider_coverage",
			"quota_or_rate_limit",
			"transient_outage",
			"unknown_provider_failure",
		]);
		for (const copy of Object.values(providerCategoryCopy)) {
			expect(copy.length).toBeGreaterThan(10);
		}
	});

	it("never turns a generic access failure into a plan, billing, or quota claim", () => {
		expect(providerCategoryCopy.access_configuration).not.toMatch(
			/plan|limit|rozlicze|płatnoś|darmow|kwot/i,
		);
		expect(providerCategoryCopy.plan_restricted).toMatch(/plan/i);
		expect(providerCategoryCopy.quota_or_rate_limit).toMatch(/limit/i);
	});

	it("labels each provider class and recovery action", () => {
		expect(Object.keys(providerClassCopy).sort()).toEqual(["lot", "miejsce", "trasa"]);
		expect(Object.keys(providerRecoveryCopy).sort()).toEqual([
			"change_parameters",
			"manual",
			"retry",
		]);
	});

	it("explains the MVP third-party limitation without blaming the traveler's input", () => {
		expect(MVP_PROVIDER_LIMIT_NOTICE).toMatch(/MVP/);
		expect(MVP_PROVIDER_LIMIT_NOTICE).not.toMatch(/błędn|nieprawidłow|zły|źle/i);
	});

	it.each([
		[
			"flight",
			flightOutcomeGuidance,
			["not_found", "timeout", "rate_limited", "provider_error", "incomplete"],
		],
		[
			"destination",
			destinationOutcomeGuidance,
			["not_found", "timeout", "rate_limited", "provider_error", "incomplete"],
		],
		[
			"journey",
			journeyOutcomeGuidance,
			[
				"zero_result",
				"no_post_arrival_route",
				"no_complete_itinerary",
				"timeout",
				"rate_limited",
				"provider_error",
				"incomplete",
			],
		],
	] as const)("gives %s outcomes a retryability and an explicit action", (_name, guidance, reasons) => {
		expect(Object.keys(guidance).sort()).toEqual([...reasons].sort());
		const retryable = Object.values(guidance).filter((entry) => entry.retryable);
		const nonRetryable = Object.values(guidance).filter((entry) => !entry.retryable);
		expect(retryable.length).toBeGreaterThan(0);
		expect(nonRetryable.length).toBeGreaterThan(0);
		for (const entry of Object.values(guidance)) {
			expect(["retry", "manual", "change_parameters"]).toContain(entry.recovery);
			expect(entry.retryable).toBe(entry.recovery === "retry");
		}
	});
});

describe("flight screen diagnostics", () => {
	it("shows the MVP limitation, the action, and the expandable QA detail", () => {
		const html = plannerMarkup(detailedDiagnostic);
		expect(html).toContain(MVP_PROVIDER_LIMIT_NOTICE);
		expect(html).toContain(providerRecoveryCopy.manual);
		expect(html).toContain("Szczegóły diagnostyczne");
		expect(html).toContain(providerClassCopy.lot);
		expect(html).toContain(providerCategoryCopy.plan_restricted);
		expect(html).toContain("cf-ray-abc123");
		expect(html).toContain("2026-08-13 09:15:30 UTC");
	});

	it("hides the QA detail when the environment rule withheld it", () => {
		const html = plannerMarkup(minimalDiagnostic);
		expect(html).toContain(MVP_PROVIDER_LIMIT_NOTICE);
		expect(html).not.toContain("Szczegóły diagnostyczne");
		expect(html).not.toContain("cf-ray-abc123");
	});

	it.each([
		["not_found", "change_parameters"],
		["timeout", "retry"],
		["rate_limited", "retry"],
		["provider_error", "manual"],
		["incomplete", "manual"],
	] as const)("gives %s distinct retryability copy and both fallback actions", (reason, recovery) => {
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
		expect(html).toContain(providerRecoveryCopy[recovery]);
		expect(html).toContain(MVP_PROVIDER_LIMIT_NOTICE);
		// Both documented recovery paths stay reachable regardless of the outcome.
		expect(html).toContain("Zapisz i kontynuuj");
		expect(html).toContain("Spróbuj ponownie");
		expect(html).not.toMatch(/aria-busy="true"/);
	});

	it("keeps the manual fallback and traveler copy when no diagnostic is present", () => {
		const html = plannerMarkup();
		expect(html).toContain("Dostawca danych jest chwilowo niedostępny.");
		expect(html).toContain("Zapisz i kontynuuj");
		expect(html).not.toContain("Szczegóły diagnostyczne");
	});
});

describe("journey and destination screens", () => {
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
		vi.useRealTimers();
	});

	it("renders the journey QA detail and keeps the manual alternative", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json({
					status: "recommendation_unavailable",
					reason: "provider_error",
					manualAlternatives: [
						{
							kind: "purchase",
							label: "Sprawdź u Terravision",
							url: "https://www.terravision.eu/airport_transfer/",
						},
					],
					diagnostic: {
						reference: "cf-ray-journey",
						occurredAtUtc: "2026-08-13T09:15:30.000Z",
						recovery: "manual",
						providerClass: "trasa",
						category: "access_configuration",
					},
				}),
			),
		);
		await act(async () =>
			root.render(
				createElement(JourneyPlanner, {
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
					destination: {
						placeId: "private-place-id",
						displayName: "Duomo di Milano",
						coordinates: { latitude: 45.464098, longitude: 9.191926 },
						supportedAreaVersion: "milan-municipality-v1",
					},
				}),
			),
		);
		await act(async () => {
			await Promise.resolve();
		});

		expect(container.textContent).toContain(MVP_PROVIDER_LIMIT_NOTICE);
		expect(container.textContent).toContain(providerCategoryCopy.access_configuration);
		expect(container.textContent).toContain("cf-ray-journey");
		expect(container.textContent).toContain("Sprawdź u Terravision");
		expect(container.querySelector("[aria-busy='true']")).toBeNull();
	});

	it("renders the destination QA detail and keeps retry plus change-input", async () => {
		vi.useFakeTimers();
		vi.stubGlobal("crypto", { randomUUID: () => "planner-session-123456" });
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json({
					status: "autocomplete_unavailable",
					reason: "rate_limited",
					diagnostic: {
						reference: "cf-ray-places",
						occurredAtUtc: "2026-08-13T09:15:30.000Z",
						recovery: "retry",
						providerClass: "miejsce",
						category: "quota_or_rate_limit",
					},
				}),
			),
		);
		await act(async () => root.render(createElement(DestinationPlanner)));
		const input = container.querySelector<HTMLInputElement>("#destination-query");
		await act(async () => {
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
			setter?.call(input as HTMLInputElement, "Via Torino");
			input?.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(400);
		});

		expect(container.textContent).toContain(MVP_PROVIDER_LIMIT_NOTICE);
		expect(container.textContent).toContain(providerCategoryCopy.quota_or_rate_limit);
		expect(container.textContent).toContain("cf-ray-places");
		expect(container.textContent).toContain("Spróbuj ponownie");
		expect(container.textContent).toContain("Zmień wpisane miejsce");
		expect(container.textContent).not.toContain("Szukamy miejsca…");
	});
});
