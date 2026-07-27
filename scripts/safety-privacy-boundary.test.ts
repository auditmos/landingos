import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeFiles = [
	"packages/data-ops/src/safety/schema.ts",
	"packages/data-ops/src/safety/table.ts",
	"packages/data-ops/src/safety/queries.ts",
	"apps/data-service/src/safety/service.ts",
	"apps/data-service/src/safety/repository.ts",
	"apps/data-service/src/hono/handlers/safety-handlers.ts",
	"apps/user-application/src/lib/safety-api.ts",
	"apps/user-application/src/components/room/use-room-safety.ts",
	"apps/user-application/src/components/room/room-safety-panel.tsx",
] as const;

const source = runtimeFiles.map((path) => readFileSync(path, "utf8")).join("\n");

describe("safety privacy and configuration boundary", () => {
	it("contains no private planner, contact, consent, role, or provider fields", () => {
		expect(source).not.toMatch(
			/\b(email|destination|placeId|coordinates|latitude|longitude|consent|role|providerPayload|unrelated)\b/i,
		);
	});

	it("keeps the immutable message evidence schema to exactly three bounded keys", () => {
		const schema = readFileSync("packages/data-ops/src/safety/schema.ts", "utf8");
		const evidence = schema.slice(
			schema.indexOf("export const SafetyReportEvidenceSchema"),
			schema.indexOf("export const SafetyReportRecordSchema"),
		);
		expect(evidence).toContain("messageText:");
		expect(evidence).toContain("authorPseudonym:");
		expect(evidence).toContain("originalMessageAt:");
		expect(evidence).not.toMatch(/email|destination|placeId|coordinates|consent|role|provider/i);
	});

	it("has no payload logs or insecure random report IDs", () => {
		expect(source).not.toMatch(/\bconsole\.(?:log|info|warn|error)\b/);
		expect(source).not.toContain("Math.random");
	});

	it("registers safety tables in every Drizzle environment and the generated migration", () => {
		for (const environment of ["dev", "staging", "production"]) {
			expect(readFileSync(`packages/data-ops/drizzle-${environment}.config.ts`, "utf8")).toContain(
				'"./src/safety/table.ts"',
			);
		}
		const migration = readFileSync(
			"packages/data-ops/src/drizzle/migrations/dev/0007_uneven_snowbird.sql",
			"utf8",
		);
		for (const table of ["community_rules_acceptances", "user_blocks", "safety_reports"]) {
			expect(migration).toContain(`CREATE TABLE "${table}"`);
		}
	});

	it("keeps history and realtime block filters on the server", () => {
		expect(readFileSync("packages/data-ops/src/room/queries.ts", "utf8")).toContain(
			"hiddenByBlock",
		);
		expect(readFileSync("apps/data-service/src/durable-objects/flight-room.ts", "utf8")).toContain(
			"excluded.has(attachment.data.userId)",
		);
	});
});
