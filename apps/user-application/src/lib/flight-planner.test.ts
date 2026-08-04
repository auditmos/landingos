import type { FlightResolveResult } from "@repo/data-ops/flight";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FlightPlanner, FlightSummary } from "@/components/flight/flight-planner";
import { PlannerResults } from "@/components/flight/flight-planner-results";
import { completeManualFlightApi, formatArrivalInRome, resolveFlightApi } from "./flight-planner";
import { currentDateInPoland, formatPolishDateInput } from "./polish-date";

const response: FlightResolveResult = {
	status: "recognized",
	flight: {
		id: "f0c77147-2942-574c-8f2c-9dc44cb46049",
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
};

describe("anonymous flight planner UI integration", () => {
	it("renders a selectable departure calendar with today in Polish notation", () => {
		const html = renderToStaticMarkup(createElement(FlightPlanner));
		const today = currentDateInPoland();
		expect(html).toContain('type="date"');
		expect(html).toContain(`value="${today}"`);
		expect(html).toContain(formatPolishDateInput(today));
		expect(html).toContain("Format: DD.MM.RRRR, np. 04.08.2026.");
		expect(html).toContain("Format: dwuznakowy kod przewoźnika i od 1 do 4 cyfr, np. FR1234.");
	});

	it("renders manual arrival using Polish date order and 24-hour time", () => {
		const html = renderToStaticMarkup(
			createElement(PlannerResults, {
				error: "",
				result: {
					status: "manual_required",
					reason: "not_found",
					flightNumber: "FR1234",
					departureLocalDate: "2026-09-14",
				},
				manualArrival: "2026-09-14T12:00",
				manualArrivalError: "",
				loading: false,
				onManualArrivalChange: () => undefined,
				onManualSubmit: () => undefined,
				onRetry: () => undefined,
				onDestinationChange: () => undefined,
			}),
		);
		expect(html).toContain('type="datetime-local"');
		expect(html).toContain('value="2026-09-14T12:00"');
		expect(html).toContain("14.09.2026, 12:00");
		expect(html).toContain("Format: DD.MM.RRRR, GG:MM (24 godz.)");
		expect(html).not.toContain("AM");
		expect(html).not.toContain("PM");
	});

	it("calls the public resolver without credentials and renders all recognized fields in Rome time", async () => {
		const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			expect(init).not.toHaveProperty("credentials");
			expect(new Headers(init?.headers).has("authorization")).toBe(false);
			return Response.json(response);
		});
		const result = await resolveFlightApi(
			{ flightNumber: "fr1234", departureLocalDate: "2026-09-14" },
			fetchImpl,
		);
		expect(result.status).toBe("recognized");
		if (result.status !== "recognized") throw new Error("Expected recognized");
		const html = renderToStaticMarkup(createElement(FlightSummary, { flight: result.flight }));
		expect(html).toContain("Ryanair");
		expect(html).toContain("FR1234");
		expect(html).toContain("WAW");
		expect(html).toContain("BGY");
		expect(html).toContain("14.09.2026");
		expect(html).toContain("10:20");
		expect(formatArrivalInRome(result.flight.scheduledArrivalUtc)).toContain("10:20");
	});

	it("preserves normalized flight/date through fallback and resumes after manual completion", async () => {
		const fallback: FlightResolveResult = {
			status: "manual_required",
			reason: "timeout",
			flightNumber: "FR1234",
			departureLocalDate: "2026-09-14",
		};
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json(fallback))
			.mockResolvedValueOnce(
				Response.json({
					...response,
					flight: { ...response.flight, source: "manual" },
				}),
			);
		const unresolved = await resolveFlightApi(
			{ flightNumber: " fr1234 ", departureLocalDate: "2026-09-14" },
			fetchImpl,
		);
		expect(unresolved).toEqual(fallback);
		const completed = await completeManualFlightApi(
			{
				flightNumber: fallback.flightNumber,
				departureLocalDate: fallback.departureLocalDate,
				destinationIata: "BGY",
				scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
			},
			fetchImpl,
		);
		expect(completed).toMatchObject({
			status: "recognized",
			flight: { source: "manual", destinationIata: "BGY" },
		});
	});

	it("rejects any extra raw provider payload at the browser boundary", async () => {
		const fetchImpl = vi.fn(async () =>
			Response.json({ ...response, providerPayload: { secret: "must-not-cross" } }),
		);
		await expect(
			resolveFlightApi({ flightNumber: "FR1234", departureLocalDate: "2026-09-14" }, fetchImpl),
		).rejects.toThrow();
	});

	it("turns a browser transport failure into a Polish actionable error", async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));

		await expect(
			resolveFlightApi({ flightNumber: "FR1234", departureLocalDate: "2026-09-14" }, fetchImpl),
		).rejects.toThrow(
			"Nie udało się połączyć z planerem. Sprawdź, czy usługa danych działa, i spróbuj ponownie.",
		);
	});
});
