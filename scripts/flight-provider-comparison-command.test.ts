import { describe, expect, it } from "vitest";
import { executeFlightProviderComparison } from "./flight-provider-comparison-command";

describe("flight provider comparison command", () => {
	it("fails before network access and names both required server-side credentials", async () => {
		let fetchCalls = 0;
		const result = await executeFlightProviderComparison({
			env: {},
			fetchImpl: async () => {
				fetchCalls += 1;
				return Response.json({});
			},
			generatedAt: "2026-09-03T12:00:00.000Z",
			nowMs: () => 0,
			onProgress: () => undefined,
		});

		expect(result).toEqual({
			exitCode: 2,
			payload: {
				status: "external_prerequisite_missing",
				missingVariables: ["AVIATIONSTACK_ACCESS_KEY", "AERODATABOX_RAPIDAPI_KEY"],
				resumeCommand: "pnpm run spike:flights:compare",
			},
		});
		expect(fetchCalls).toBe(0);
	});
});
