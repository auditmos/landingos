import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	JourneySourceReferenceSchema,
	TransferCatalogEntrySchema,
} from "../packages/data-ops/src/journey/schema";

const ROOT = resolve(import.meta.dirname, "..");
const PRIVATE_DESTINATION_FIELDS =
	/\b(placeId|displayName|coordinates|latitude|longitude|destinationDisplayText|address)\b/;

function source(path: string): string {
	return readFileSync(resolve(ROOT, path), "utf8");
}

function filesUnder(path: string): string[] {
	return readdirSync(path).flatMap((entry) => {
		if (["node_modules", "dist", ".wrangler"].includes(entry)) return [];
		const child = join(path, entry);
		return statSync(child).isDirectory() ? filesUnder(child) : [child];
	});
}

describe("journey privacy boundary", () => {
	it("keeps exact destination fields out of catalog rows, seed, and queries", () => {
		for (const path of [
			"packages/data-ops/src/journey/table.ts",
			"packages/data-ops/src/journey/queries.ts",
			"packages/data-ops/src/database/seed/seed.ts",
			"packages/data-ops/src/drizzle/migrations/dev/0004_workable_meggan.sql",
		]) {
			expect(source(path), path).not.toMatch(PRIVATE_DESTINATION_FIELDS);
		}
		expect(() =>
			TransferCatalogEntrySchema.parse({
				id: "entry",
				operatorName: "Operator",
				serviceName: "Bus",
				originIata: "BGY",
				destinationStopCode: "MILANO_CENTRALE",
				destinationStopName: "Milano Centrale",
				durationMinutes: 50,
				transferCount: 0,
				walkingMinutes: 0,
				walkingMeters: 0,
				sourceUrl: "https://www.milanbergamoairport.it/en/bus/",
				checkedAt: "2026-07-27T00:00:00.000Z",
				costMinorMin: 1_000,
				costMinorMax: 1_200,
				purchaseUrl: "https://www.airportbusexpress.it/tickets",
				publicationStatus: "published",
				provenance: "seeded_fixture",
				createdAt: "2026-07-27T00:00:00.000Z",
				updatedAt: "2026-07-27T00:00:00.000Z",
				placeId: "private-place",
			}),
		).toThrow();
	});

	it("keeps exact destination fields out of source references and room dependencies", () => {
		expect(() =>
			JourneySourceReferenceSchema.parse({
				kind: "provider",
				label: "Fixture Transit",
				url: null,
				checkedAt: null,
				displayName: "Private Hotel",
				coordinates: { latitude: 45.46, longitude: 9.19 },
			}),
		).toThrow();
		for (const path of [
			"apps/data-service/src/journey/engine.ts",
			"apps/data-service/src/journey/service.ts",
		]) {
			expect(source(path), path).not.toMatch(/\broom(s|Member|Query|Repository)?\b/i);
		}
	});

	it("keeps exact destination values out of logging and analytics source files", () => {
		const telemetryFiles = filesUnder(resolve(ROOT, "apps")).filter(
			(path) =>
				/\.(ts|tsx)$/.test(path) &&
				!path.endsWith(".test.ts") &&
				/(analytics|telemetry|logger|error-handler)/i.test(path),
		);
		expect(telemetryFiles.length).toBeGreaterThan(0);
		for (const path of telemetryFiles) {
			expect(readFileSync(path, "utf8"), path).not.toMatch(PRIVATE_DESTINATION_FIELDS);
		}
	});
});
