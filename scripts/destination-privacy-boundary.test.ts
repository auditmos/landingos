import { describe, expect, it } from "vitest";
import { FlightInstanceSchema } from "../packages/data-ops/src/flight/schema";
import { isRuntimeSource, matching, scanFiles } from "./leak-scan";

const FORBIDDEN_DESTINATION_FIELDS =
	/\b(placeId|displayName|coordinates|latitude|longitude|destinationDisplayText)\b/;

const TELEMETRY_FILE = /(analytics|telemetry|logger|error-handler)/i;

describe("destination privacy boundary", () => {
	it("keeps exact destination fields out of flight persistence and non-private public schemas", () => {
		// The destination and journey domains own the private planner data; every
		// other schema, handler, and telemetry file must stay clear of it.
		const publicSchemaFiles = scanFiles(["packages/data-ops/src"], {
			include: (path) =>
				/(schema|table)\.ts$/.test(path) &&
				isRuntimeSource(path) &&
				!path.includes("/destination/") &&
				!path.includes("/journey/"),
		});
		const publicHandlerFiles = scanFiles(["apps/data-service/src/hono/handlers"], {
			include: (path) =>
				path.endsWith("-handlers.ts") &&
				!path.endsWith("destination-handlers.ts") &&
				!path.endsWith("journey-handlers.ts"),
		});
		const telemetryAndLogFiles = scanFiles(["apps"], {
			include: (path) => isRuntimeSource(path) && TELEMETRY_FILE.test(path),
		});

		expect(publicSchemaFiles.length).toBeGreaterThan(0);
		expect(publicHandlerFiles.length).toBeGreaterThan(0);
		expect(telemetryAndLogFiles.length).toBeGreaterThan(0);
		expect(
			matching(
				[...publicSchemaFiles, ...publicHandlerFiles, ...telemetryAndLogFiles],
				FORBIDDEN_DESTINATION_FIELDS,
			),
		).toEqual([]);
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
