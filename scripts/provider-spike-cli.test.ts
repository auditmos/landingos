import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const LIVE_VARIABLES = [
	"LANDINGOS_FLIGHT_PROVIDER",
	"LANDINGOS_PLACES_PROVIDER",
	"LANDINGOS_TRANSIT_PROVIDER",
	"AVIATIONSTACK_ACCESS_KEY",
	"GOOGLE_MAPS_API_KEY",
] as const;

function credentialFreeEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env, CLOUDFLARE_ENV: "dev" };
	for (const variable of LIVE_VARIABLES) {
		delete env[variable];
	}
	return env;
}

describe("provider spike CLI", () => {
	it("runs the deterministic fixture spike without credentials", () => {
		const result = spawnSync("pnpm", ["run", "spike:data:fixtures"], {
			cwd: process.cwd(),
			encoding: "utf8",
			env: credentialFreeEnv(),
		});

		expect(result.status).toBe(0);
		expect(result.stderr).toContain("[s0] fixture contracts");
		const summary = JSON.parse(result.stdout);
		expect(summary).toMatchObject({
			schemaVersion: "s0-provider-readiness-v1",
			mode: "fixture",
			datasetLabel: "synthetic_recorded_for_testing",
			viewportVersion: "milan-municipality-v1",
		});
		expect(summary.contracts.flight.successful).toBeGreaterThanOrEqual(10);
		expect(summary.contracts.transit.successful).toBeGreaterThanOrEqual(10);
	});

	it("exits exactly 2 with a typed missing-prerequisite result for live mode", () => {
		const result = spawnSync("pnpm", ["run", "spike:data"], {
			cwd: process.cwd(),
			encoding: "utf8",
			env: credentialFreeEnv(),
		});

		expect(result.status).toBe(2);
		const resultLine = result.stdout.split("\n").find((line) => line.startsWith("{"));
		expect(JSON.parse(resultLine ?? "")).toEqual({
			status: "external_prerequisite_missing",
			liveStatus: "not_run_missing_credentials",
			missingVariables: [...LIVE_VARIABLES],
			resumeCommand: "pnpm run spike:data",
		});
		expect(result.stderr).not.toContain("Error:");
		expect(result.stderr).not.toContain(" at ");
	});
});
