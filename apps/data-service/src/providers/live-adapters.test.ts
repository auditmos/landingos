import { describe, expect, it, vi } from "vitest";
import { createLiveProviderAdapters } from "./live-adapters";
import type { ProviderFetch } from "./live-http";
import { MILAN_MUNICIPALITY_VIEWPORT } from "./milan-viewport";

describe("live provider adapters", () => {
	it("composes the live contracts without exposing fixture catalog data", async () => {
		const adapters = createLiveProviderAdapters(
			{
				aviationstackAccessKey: "test-flight-key",
				googleMapsApiKey: "test-google-key",
			},
			async () => Response.json({}),
		);

		expect(adapters.mode).toBe("live");
		expect(adapters.places.viewport).toBe(MILAN_MUNICIPALITY_VIEWPORT);
		expect(await adapters.transferCatalog.list()).toEqual({
			status: "zero_result",
		});
	});

	it("routes flight lookups to the explicitly selected AeroDataBox adapter", async () => {
		const fetchImpl = vi.fn<ProviderFetch>(async () => Response.json([]));
		const adapters = createLiveProviderAdapters(
			{
				flightProvider: "aerodatabox",
				aerodataboxRapidApiKey: "aero-secret",
				googleMapsApiKey: "test-google-key",
			},
			fetchImpl,
		);

		await adapters.flight.lookup({ flightNumber: "FR889", date: "2026-09-01" });

		expect(fetchImpl).toHaveBeenCalledOnce();
		const [url, init] = fetchImpl.mock.calls[0] ?? [];
		expect(url).toContain("aerodatabox.p.rapidapi.com/flights/number/FR889/2026-09-01");
		expect(new Headers(init?.headers).get("X-RapidAPI-Key")).toBe("aero-secret");
	});
});
