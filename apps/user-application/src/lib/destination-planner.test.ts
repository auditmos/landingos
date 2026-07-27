import type {
	DestinationAutocompleteResult,
	DestinationPrediction,
} from "@repo/data-ops/destination";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DestinationPredictionList } from "@/components/destination/destination-planner";
import {
	autocompleteDestinationApi,
	createDestinationSearchScheduler,
	destinationReasonCopy,
	selectDestinationApi,
} from "./destination-planner";

describe("destination autocomplete scheduling", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("makes zero calls below three trimmed characters and waits exactly 250 ms", async () => {
		vi.useFakeTimers();
		const search = vi.fn(
			async (): Promise<DestinationAutocompleteResult> => ({
				status: "suggestions",
				predictions: [],
			}),
		);
		const scheduler = createDestinationSearchScheduler(search);

		expect(scheduler.update("  ab  ", vi.fn())).toBe(false);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(search).not.toHaveBeenCalled();

		expect(scheduler.update("  dom  ", vi.fn())).toBe(true);
		await vi.advanceTimersByTimeAsync(249);
		expect(search).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(search).toHaveBeenCalledTimes(1);
		expect(search).toHaveBeenCalledWith("dom", expect.any(AbortSignal));
	});

	it("aborts a superseded request and ignores its stale result", async () => {
		vi.useFakeTimers();
		const pending: Array<{
			signal: AbortSignal;
			resolve: (result: DestinationAutocompleteResult) => void;
		}> = [];
		const search = vi.fn(
			(_query: string, signal: AbortSignal) =>
				new Promise<DestinationAutocompleteResult>((resolve) => {
					pending.push({ signal, resolve });
				}),
		);
		const firstResult = vi.fn();
		const secondResult = vi.fn();
		const scheduler = createDestinationSearchScheduler(search);

		scheduler.update("hotel", firstResult);
		await vi.advanceTimersByTimeAsync(250);
		scheduler.update("duomo", secondResult);
		expect(pending[0]?.signal.aborted).toBe(true);
		await vi.advanceTimersByTimeAsync(250);

		pending[0]?.resolve({ status: "autocomplete_unavailable", reason: "timeout" });
		pending[1]?.resolve({ status: "suggestions", predictions: [] });
		await Promise.resolve();
		expect(firstResult).not.toHaveBeenCalled();
		expect(secondResult).toHaveBeenCalledOnce();
	});
});

describe("private destination UI and API contract", () => {
	it("renders distinct primary/secondary text and never silently selects a prediction", () => {
		const predictions: DestinationPrediction[] = [
			{
				placeId: "fixture:place:via-torino",
				primaryText: "Via Torino 42",
				secondaryText: "20123 Milano MI, Włochy",
			},
			{
				placeId: "fixture:place:hotel-berna",
				primaryText: "Hotel Berna",
				secondaryText: "Via Napo Torriani 18, Milano",
			},
			{
				placeId: "fixture:place:duomo",
				primaryText: "Duomo di Milano",
				secondaryText: "Piazza del Duomo, Milano",
			},
		];
		const onSelect = vi.fn();
		const html = renderToStaticMarkup(
			createElement(DestinationPredictionList, { predictions, onSelect }),
		);
		for (const prediction of predictions) {
			expect(html).toContain(prediction.primaryText);
			expect(html).toContain(prediction.secondaryText);
		}
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("reuses one session token and makes one details request after explicit selection", async () => {
		const token = "planner-session-123456";
		const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			calls.push({ url, body: JSON.parse(String(init?.body)) });
			return url.endsWith("/autocomplete")
				? Response.json({
						status: "suggestions",
						predictions: [
							{
								placeId: "fixture:place:duomo",
								primaryText: "Duomo di Milano",
								secondaryText: "Piazza del Duomo, Milano",
							},
						],
					})
				: Response.json({
						status: "destination_selected",
						destination: {
							placeId: "fixture:place:duomo",
							displayName: "Duomo di Milano",
							coordinates: { latitude: 45.464098, longitude: 9.191926 },
							supportedAreaVersion: "milan-municipality-v1",
						},
					});
		});
		const autocomplete = await autocompleteDestinationApi(
			{ query: "Duomo", sessionToken: token },
			undefined,
			fetchImpl,
		);
		expect(autocomplete.status).toBe("suggestions");
		await selectDestinationApi(
			{ placeId: "fixture:place:duomo", sessionToken: token },
			undefined,
			fetchImpl,
		);
		expect(calls).toHaveLength(2);
		expect(calls.filter((call) => call.url.endsWith("/select"))).toHaveLength(1);
		expect(calls.map((call) => call.body.sessionToken)).toEqual([token, token]);
	});

	it("has Polish retry guidance for every controlled provider failure", () => {
		expect(Object.keys(destinationReasonCopy)).toEqual([
			"not_found",
			"timeout",
			"rate_limited",
			"provider_error",
			"incomplete",
		]);
		for (const copy of Object.values(destinationReasonCopy)) {
			expect(copy).toMatch(/[ąćęłńóśźż]/i);
		}
	});
});
