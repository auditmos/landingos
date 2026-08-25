import { describe, expect, it } from "vitest";
import { isRuntimeSource, matching, source as read, scanFiles, scannedSource } from "./leak-scan";

/** Feature directories, swept whole — a new file here is scanned automatically. */
const SAFETY_DIRECTORIES = [
	"packages/data-ops/src/safety",
	"apps/data-service/src/safety",
	"apps/user-application/src/components/room",
] as const;

/** Shared directories, narrowed to the files that carry safety traffic. */
const SHARED_DIRECTORIES = [
	"apps/data-service/src/hono/handlers",
	"apps/user-application/src/lib",
] as const;
const SAFETY_FILE = /(safety|report|block)/i;

/** Files swept in that legitimately carry a forbidden token, each named on purpose. */
const ALLOWLIST: readonly string[] = [];

const runtimeFiles = [
	...scanFiles(SAFETY_DIRECTORIES, { include: isRuntimeSource, allowlist: ALLOWLIST }),
	...scanFiles(SHARED_DIRECTORIES, {
		include: (path) => isRuntimeSource(path) && SAFETY_FILE.test(path),
		allowlist: ALLOWLIST,
	}),
];
const source = scannedSource(runtimeFiles);
const forbiddenExactKeys = [
	"email",
	"destination",
	"destinationText",
	"destinationPlaceId",
	"destinationCoordinates",
	"placeId",
	"coordinates",
	"latitude",
	"longitude",
	"consent",
	"marketingConsent",
	"role",
	"providerPayload",
	"unrelatedMessages",
] as const;

describe("safety privacy and configuration boundary", () => {
	it("contains no private planner, contact, consent, or provider values", () => {
		expect(runtimeFiles.length).toBeGreaterThan(0);
		expect(
			matching(
				runtimeFiles,
				/\b(email|destination|placeId|coordinates|latitude|longitude|consent|providerPayload|unrelatedMessages)\b/i,
			),
		).toEqual([]);
	});

	it("contains none of the forbidden exact payload or snapshot keys", () => {
		for (const key of forbiddenExactKeys) {
			expect(source, `forbidden safety key: ${key}`).not.toMatch(
				new RegExp(`(?:\\b${key}|["']${key}["'])\\s*:`),
			);
		}
	});

	it("keeps the immutable message evidence schema to exactly three bounded keys", () => {
		const schema = read("packages/data-ops/src/safety/schema.ts");
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
		expect(matching(runtimeFiles, /\bconsole\.(?:log|info|warn|error)\b/)).toEqual([]);
		expect(matching(runtimeFiles, /Math\.random/)).toEqual([]);
	});

	it("registers safety tables in every Drizzle environment and the generated migration", () => {
		for (const environment of ["dev", "staging", "production"]) {
			expect(read(`packages/data-ops/drizzle-${environment}.config.ts`)).toContain(
				'"./src/safety/table.ts"',
			);
		}
		const migration = read("packages/data-ops/src/drizzle/migrations/dev/0007_uneven_snowbird.sql");
		for (const table of ["community_rules_acceptances", "user_blocks", "safety_reports"]) {
			expect(migration).toContain(`CREATE TABLE "${table}"`);
		}
	});

	it("keeps the operator triage queue on pseudonyms and frozen evidence only", () => {
		const schema = read("packages/data-ops/src/safety/schema.ts");
		const item = schema.slice(
			schema.indexOf("export const SafetyReportQueueItemSchema"),
			schema.indexOf("export const SafetyReportQueueResponseSchema"),
		);
		expect(item).toContain("reporterPseudonym:");
		expect(item).toContain("targetPseudonym:");
		expect(item).not.toMatch(/reporterId|targetUserId|email|destination|placeId|coordinates/i);

		const queue = scanFiles(
			[
				"apps/data-service/src/hono/handlers",
				"apps/user-application/src/lib",
				"apps/user-application/src/components/operator",
			],
			{ include: (path) => isRuntimeSource(path) && /report/i.test(path) },
		);
		expect(queue.length).toBeGreaterThan(0);
		expect(
			matching(queue, /\b(reporterId|targetUserId|placeId|coordinates|destination)\b/i),
		).toEqual([]);
		expect(matching(queue, /\bconsole\.(?:log|info|warn|error)\b/)).toEqual([]);
	});

	it("gates every operator report route behind the shared server-side check", () => {
		const handlers = read("apps/data-service/src/hono/handlers/operator-reports-handlers.ts");
		expect(handlers).toContain('reports.use("*", operatorOnly(dependencies))');
		expect(read("apps/data-service/src/hono/app.ts")).toContain(
			'App.route("/operator/reports", operatorReports)',
		);
		// The acting operator comes from the verified session, never the request body.
		expect(handlers).toContain('operatorId: c.get("operatorUserId")');
		expect(handlers).not.toMatch(/operatorId:\s*(?:parsed|body|input)\./);
	});

	it("lets triage move only the status, never the reported evidence", () => {
		const schema = read("packages/data-ops/src/safety/schema.ts");
		const patchStart = schema.indexOf("export const SafetyReportStatusPatchSchema");
		const patch = schema.slice(patchStart, schema.indexOf("});", patchStart) + 3);
		expect(patch).toContain("z.strictObject");
		expect(patch).not.toMatch(/note|reason|evidence|messageText|Pseudonym/i);

		const queries = read("packages/data-ops/src/safety/queries.ts");
		const mutation = queries.slice(queries.indexOf("export async function setSafetyReportStatus"));
		for (const immutable of [
			"reason:",
			"note:",
			"evidenceSnapshot:",
			"reporterId:",
			"messageId:",
		]) {
			expect(mutation).not.toContain(immutable);
		}
	});

	it("keeps history and realtime block filters on the server", () => {
		expect(read("packages/data-ops/src/room/queries.ts")).toContain("hiddenByBlock");
		expect(read("apps/data-service/src/durable-objects/flight-room.ts")).toContain(
			"excluded.has(attachment.data.userId)",
		);
	});
});
