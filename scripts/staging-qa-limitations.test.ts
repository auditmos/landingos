import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PROVIDER_DIAGNOSTIC_CATEGORIES } from "../packages/data-ops/src/diagnostics/schema";

const ROOT = resolve(import.meta.dirname, "..");
const GUIDE = readFileSync(resolve(ROOT, "docs/qa/staging-provider-limitations.md"), "utf8");

describe("staging QA limitations guide", () => {
	it("names the measured limitations and links to the recorded evidence", () => {
		expect(GUIDE).toContain("7/10 poprawnych");
		expect(GUIDE).toContain("0/5 udanych");
		expect(GUIDE).toContain("9/10 udanych");
		expect(GUIDE).toContain("docs/evidence/s0-provider-readiness.md");
		expect(GUIDE).toContain("issue16-live-flight-results.json");
	});

	it("states the provider limits precisely instead of calling everything a free version", () => {
		expect(GUIDE).toContain("https://aviationstack.com/pricing");
		expect(GUIDE).toContain(
			"https://developers.google.com/maps/documentation/places/web-service/usage-and-billing",
		);
		expect(GUIDE).toContain("nie jest** „darmowa wersja”");
		expect(GUIDE).toContain("nie dowodzi");
	});

	it("keeps provider suitability, commercial acceptance, and production readiness unresolved", () => {
		expect(GUIDE).toContain("NOT READY");
		expect(GUIDE).toMatch(/akceptacja kosztowo-licencyjna/i);
		expect(GUIDE).toMatch(/zgoda prywatnościowa/i);
		expect(GUIDE).not.toMatch(/gotowość produkcyjna: (GO|gotowe)/i);
	});

	it("documents the environment rule and every normalized category the tester can see", () => {
		expect(GUIDE).toContain("`local`, `dev`, `test` i `staging`");
		expect(GUIDE).toContain("Na produkcji ta sekcja **nie jest renderowana**");
		expect(PROVIDER_DIAGNOSTIC_CATEGORIES).toHaveLength(7);
		expect(GUIDE).toMatch(/siedmiu znormalizowanych/);
	});

	it("tells QA that an unattributed 401/403 blamed on a plan or billing is a bug", () => {
		expect(GUIDE).toMatch(/401\/403 zostaje opisane jako limit darmowego planu/);
	});
});
