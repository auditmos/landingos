import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OPERATOR_CATALOG_FIELDS } from "../packages/data-ops/src/journey/operator-fields";
import { CatalogTransferAlternativeSchema } from "../packages/data-ops/src/journey/schema";

const ROOT = resolve(import.meta.dirname, "..");

function source(path: string): string {
	return readFileSync(resolve(ROOT, path), "utf8");
}

const alternative = {
	id: "catalog-1",
	kind: "manually_verified_transfer",
	operatorName: "Terravision",
	serviceName: "BGY → Milano Centrale",
	destinationStopCode: "milano-centrale",
	destinationStopName: "Milano Centrale",
	durationMinutes: 60,
	transferCount: 1,
	walkingMinutes: 7,
	walkingMeters: 420,
	cost: { currency: "EUR", minorMin: 1_000, minorMax: 1_200, completeness: "partial" },
	source: {
		kind: "catalog",
		label: "Terravision · BGY → Milano Centrale",
		url: "https://www.milanbergamoairport.it/en/bus/",
		checkedAt: "2026-08-01T00:00:00.000Z",
	},
	freshness: "fresh",
	purchaseLink: null,
} as const;

describe("operator catalog boundary", () => {
	it("accepts only the allowlisted manually verified transfer fields", () => {
		expect(CatalogTransferAlternativeSchema.parse(alternative)).toEqual(alternative);
	});

	it.each([
		["placeId", "ChIJ-private"],
		["destinationDisplayText", "Via Segreta 42"],
		["coordinates", { latitude: 45.464098, longitude: 9.191926 }],
		["email", "traveler@example.com"],
		["rawPayload", { routes: [] }],
		["arrivalTimeUtc", "2026-08-13T10:00:00.000Z"],
		["badges", ["recommended"]],
		["steps", []],
	])("rejects a catalog alternative carrying %s", (field, value) => {
		expect(() =>
			CatalogTransferAlternativeSchema.parse({ ...alternative, [field]: value }),
		).toThrow();
	});

	it("keeps private planner data out of the catalog field definitions", () => {
		const definitions = source("packages/data-ops/src/journey/operator-fields.ts");
		expect(definitions).not.toMatch(/placeId|coordinates|latitude|longitude|e-?mail|pokoj|pokój/i);
		for (const field of OPERATOR_CATALOG_FIELDS) {
			expect(field.help).not.toMatch(/adres podróżn|dokładny adres|współrzędn|e-?mail/i);
		}
	});

	it("keeps room, message, and provider payload data out of the catalog engine output", () => {
		const engine = source("apps/data-service/src/journey/engine.ts");
		expect(engine).not.toMatch(/roomId|memberId|messageBody|rawPayload|pseudonym/i);
	});

	it("opens every catalog link in a safely targeted new tab", () => {
		const planner = source("apps/user-application/src/components/journey/journey-planner.tsx");
		const anchors = planner.match(/<a\b[\s\S]*?>/g) ?? [];
		expect(anchors.length).toBeGreaterThan(0);
		for (const anchor of anchors) {
			expect(anchor).toContain('rel="noopener noreferrer"');
			expect(anchor).toContain('target="_blank"');
		}
	});

	it("still contains no payment or ticket-purchase flow", () => {
		for (const path of [
			"apps/user-application/src/components/journey/journey-planner.tsx",
			"apps/user-application/src/components/operator/operator-catalog-console.tsx",
			"apps/data-service/src/journey/engine.ts",
		]) {
			expect(source(path)).not.toMatch(
				/stripe|checkout|payment[_-]?intent|card[_-]?number|koszyk|zapłać/i,
			);
		}
	});
});
