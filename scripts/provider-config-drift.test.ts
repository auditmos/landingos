import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SERVER_PROVIDER_VARIABLES = [
	"LANDINGOS_PROVIDER_MODE",
	"LANDINGOS_FLIGHT_PROVIDER",
	"LANDINGOS_PLACES_PROVIDER",
	"LANDINGOS_TRANSIT_PROVIDER",
	"AVIATIONSTACK_ACCESS_KEY",
	"GOOGLE_MAPS_API_KEY",
] as const;

describe("provider environment examples", () => {
	it("documents blank server-only variables and fail-closed mode semantics", () => {
		for (const path of [".env.example", "apps/data-service/.dev.vars.example"]) {
			const contents = readFileSync(path, "utf8");
			for (const variable of SERVER_PROVIDER_VARIABLES) {
				expect(contents).toContain(`${variable}=`);
				expect(contents).not.toMatch(new RegExp(`^${variable}=\\S+`, "m"));
			}
			expect(contents).toContain("fixture is local/dev only");
			expect(contents).toContain("staging/production require explicit live mode");
		}
	});

	it("does not expose provider credentials in the browser environment example", () => {
		const browserExample = readFileSync("apps/user-application/.env.example", "utf8");
		for (const variable of SERVER_PROVIDER_VARIABLES) {
			expect(browserExample).not.toContain(variable);
		}
	});
});
