import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function filesUnder(path: string): string[] {
	const paths: string[] = [];
	for (const entry of readdirSync(path)) {
		const child = join(path, entry);
		if (statSync(child).isDirectory()) {
			paths.push(...filesUnder(child));
		} else {
			paths.push(child);
		}
	}
	return paths;
}

function scan(paths: string[], pattern: RegExp): string[] {
	return paths.filter((path) => pattern.test(readFileSync(path, "utf8")));
}

describe("provider security boundaries", () => {
	it("keeps provider configuration and endpoints out of browser sources", () => {
		const browserFiles = [
			...filesUnder("apps/user-application/src"),
			...filesUnder("apps/user-application/public"),
		].filter((path) => !path.endsWith(".test.ts"));
		expect(
			scan(
				browserFiles,
				/LANDINGOS_|AVIATIONSTACK_ACCESS_KEY|GOOGLE_MAPS_API_KEY|aviationstack\.com|places\.googleapis\.com|routes\.googleapis\.com/,
			),
		).toEqual([]);
	});

	it("keeps raw provider payload markers out of fixtures and evidence", () => {
		const fixtureAndEvidenceFiles = [
			"apps/data-service/src/providers/fixture-data.ts",
			"apps/data-service/src/providers/live-flight-sample.ts",
			"apps/data-service/src/providers/live-spike.ts",
			...filesUnder("docs/evidence"),
		];
		expect(
			scan(fixtureAndEvidenceFiles, /"access_key"|X-Goog-Api-Key|rawPayload|raw_payload/),
		).toEqual([]);
	});

	it("does not log inside provider adapters", () => {
		const providerSourceFiles = filesUnder("apps/data-service/src/providers").filter(
			(path) =>
				path.endsWith(".ts") && !path.endsWith(".test.ts") && !path.endsWith("fixture-data.ts"),
		);
		expect(scan(providerSourceFiles, /\bconsole\.(log|info|warn|error)\b/)).toEqual([]);
	});
});
