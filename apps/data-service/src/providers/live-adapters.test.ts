import { describe, expect, it } from "vitest";
import { createLiveProviderAdapters } from "./live-adapters";
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
});
