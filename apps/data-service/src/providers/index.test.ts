import { describe, expect, it } from "vitest";
import {
	containsCoordinate,
	createFixtureProviderAdapters,
	MILAN_MUNICIPALITY_VIEWPORT,
	resolveProviderConfig,
	runFixtureSpike,
} from "./index";

describe("provider public interface", () => {
	it("exports the stable contracts, configuration, fixture adapters, and spike", async () => {
		expect(createFixtureProviderAdapters().mode).toBe("fixture");
		expect(resolveProviderConfig({}).ok).toBe(true);
		expect(
			containsCoordinate({
				latitude: 45.464098,
				longitude: 9.191926,
			}),
		).toBe(true);
		expect((await runFixtureSpike()).viewportVersion).toBe(MILAN_MUNICIPALITY_VIEWPORT.version);
	});
});
