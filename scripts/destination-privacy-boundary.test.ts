import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FlightInstanceSchema } from "../packages/data-ops/src/flight/schema";

const ROOT = resolve(import.meta.dirname, "..");
const FORBIDDEN_DESTINATION_FIELDS =
	/\b(placeId|displayName|coordinates|latitude|longitude|destinationDisplayText)\b/;

function filesUnder(path: string): string[] {
	return readdirSync(path).flatMap((entry) => {
		if (["node_modules", "dist", ".wrangler"].includes(entry)) return [];
		const child = join(path, entry);
		return statSync(child).isDirectory() ? filesUnder(child) : [child];
	});
}

describe("destination privacy boundary", () => {
	it("keeps exact destination fields out of flight persistence and non-private public schemas", () => {
		const publicSchemaFiles = filesUnder(resolve(ROOT, "packages/data-ops/src")).filter(
			(file) =>
				/(schema|table)\.ts$/.test(file) &&
				!file.includes("/destination/") &&
				!file.includes("/journey/") &&
				!file.endsWith(".test.ts"),
		);
		const publicHandlerFiles = filesUnder(
			resolve(ROOT, "apps/data-service/src/hono/handlers"),
		).filter(
			(file) =>
				file.endsWith("-handlers.ts") &&
				!file.endsWith("destination-handlers.ts") &&
				!file.endsWith("journey-handlers.ts"),
		);
		const telemetryAndLogFiles = filesUnder(resolve(ROOT, "apps")).filter(
			(file) =>
				/\.(ts|tsx)$/.test(file) &&
				!file.endsWith(".test.ts") &&
				/(analytics|telemetry|logger|error-handler)/i.test(file),
		);
		for (const file of [...publicSchemaFiles, ...publicHandlerFiles, ...telemetryAndLogFiles]) {
			expect(readFileSync(file, "utf8"), file).not.toMatch(FORBIDDEN_DESTINATION_FIELDS);
		}
		expect(() =>
			FlightInstanceSchema.parse({
				id: "flight",
				marketingCarrierCode: "FR",
				marketingCarrierName: "Ryanair",
				marketingFlightNumber: "1234",
				operatingCarrierCode: "FR",
				operatingFlightNumber: "1234",
				departureLocalDate: "2026-09-14",
				originIata: "WAW",
				destinationIata: "BGY",
				scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
				displayTimezone: "Europe/Rome",
				source: "provider",
				placeId: "private-place",
				coordinates: { latitude: 45.46, longitude: 9.19 },
			}),
		).toThrow();
	});
});
