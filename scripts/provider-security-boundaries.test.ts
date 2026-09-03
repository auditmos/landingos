import { describe, expect, it } from "vitest";
import { matching, scanFiles } from "./leak-scan";

describe("provider security boundaries", () => {
	it("keeps provider configuration and endpoints out of browser sources", () => {
		const browserFiles = scanFiles(["apps/user-application/src", "apps/user-application/public"], {
			include: (path) => !/\.test\.(ts|tsx)$/.test(path),
		});

		expect(browserFiles.length).toBeGreaterThan(0);
		expect(
			matching(
				browserFiles,
				/LANDINGOS_|AVIATIONSTACK_ACCESS_KEY|AERODATABOX_RAPIDAPI_KEY|GOOGLE_MAPS_API_KEY|aviationstack\.com|aerodatabox\.p\.rapidapi\.com|places\.googleapis\.com|routes\.googleapis\.com/,
			),
		).toEqual([]);
	});

	it("keeps raw provider payload markers out of fixtures and evidence", () => {
		const fixtureAndEvidenceFiles = scanFiles([
			"apps/data-service/src/providers/fixture-data.ts",
			"apps/data-service/src/providers/flight-provider-comparison.ts",
			"apps/data-service/src/providers/live-flight-sample.ts",
			"apps/data-service/src/providers/live-spike.ts",
			"docs/evidence",
		]);

		expect(fixtureAndEvidenceFiles.length).toBeGreaterThan(3);
		expect(
			matching(
				fixtureAndEvidenceFiles,
				/"access_key"|X-Goog-Api-Key|X-RapidAPI-Key|rawPayload|raw_payload/,
			),
		).toEqual([]);
	});

	it("does not log inside provider adapters", () => {
		const providerSourceFiles = scanFiles(["apps/data-service/src/providers"], {
			include: (path) => /\.ts$/.test(path) && !/\.test\.ts$/.test(path),
			// Fixture data prints its own deterministic spike summary.
			allowlist: ["apps/data-service/src/providers/fixture-data.ts"],
		});

		expect(providerSourceFiles.length).toBeGreaterThan(0);
		expect(matching(providerSourceFiles, /\bconsole\.(log|info|warn|error)\b/)).toEqual([]);
	});
});
