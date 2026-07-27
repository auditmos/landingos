import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const STATUS = "implementation verified; independent compliance approval pending";
const COMMUNITY_RULES_VERSION = "2026-07-26-v1";
const COMMUNITY_RULES_TOPICS = [
	"Szanuj innych. Nie nękaj, nie groź, nie dyskryminuj i nie podszywaj się pod inne osoby.",
	"Nie wywieraj presji dotyczącej pieniędzy ani prywatnych informacji. Nie udostępniaj danych osobowych innych osób.",
	"LandingOS nie weryfikuje tożsamości ani nie gwarantuje wspólnego przejazdu. Kieruj się rozsądkiem — blokuj i zgłaszaj problemy.",
	"Nie publikuj nielegalnych treści ani komercyjnego spamu.",
] as const;

const canaries = {
	email: "privacy-email-canary-94d2@example.test",
	address: "Via privacy-address-canary-94d2",
	placeId: "privacy-place-canary-94d2",
	coordinates: "45.privacy-coordinates-canary-94d2",
	message: "privacy-message-canary-94d2",
};

describe("S8 public privacy boundaries", () => {
	it("rejects every private canary from room, system-event, and analytics contracts", () => {
		const roomSchema = read("packages/data-ops/src/room/schema.ts");
		const analyticsSchema = read("packages/data-ops/src/analytics/schema.ts");
		expect(roomSchema).toContain("RoomSnapshotSchema = z.strictObject");
		expect(roomSchema).toContain("RoomRedactedEventSchema = z.strictObject");
		expect(analyticsSchema).toMatch(/AnalyticsEventSchema = z\s*\.strictObject/);
		for (const forbidden of [
			"email:",
			"destination:",
			"placeId:",
			"coordinates:",
			"messageContent:",
		]) {
			expect(`${roomSchema}\n${analyticsSchema}`).not.toContain(forbidden);
		}
		expect(JSON.stringify({ type: "room_redacted" })).not.toMatch(
			new RegExp(Object.values(canaries).join("|"), "i"),
		);
	});

	it("keeps lifecycle and error paths free of request-body or private-value logging", () => {
		for (const path of [
			"apps/data-service/src/hono/handlers/lifecycle-handlers.ts",
			"apps/data-service/src/hono/handlers/room-handlers.ts",
			"apps/data-service/src/hono/middleware/error-handler.ts",
			"apps/data-service/src/durable-objects/flight-room.ts",
			"apps/user-application/src/lib/account-deletion-api.ts",
			"apps/user-application/src/lib/account-deletion-hook.ts",
			"packages/data-ops/src/lifecycle/queries.ts",
		]) {
			const source = read(path);
			expect(source).not.toMatch(/console\.(debug|error|info|log|warn)/);
			expect(source).not.toMatch(/log(Request|Body|Payload|Destination|Message|Email)/i);
			expect(source).not.toContain(canaries.email);
			expect(source).not.toContain(canaries.address);
			expect(source).not.toContain(canaries.placeId);
			expect(source).not.toContain(canaries.coordinates);
			expect(source).not.toContain(canaries.message);
		}
	});

	it("locks the exact lifecycle constants, tombstones, migration, and every-environment cron", () => {
		const constants = read("packages/data-ops/src/lifecycle/constants.ts");
		expect(constants).toContain("24 * 60 * 60 * 1_000");
		expect(constants).toContain("30 * 24 * 60 * 60 * 1_000");
		expect(constants).toContain("LIFECYCLE_CLEANUP_BATCH_SIZE = 100");
		expect(constants).toContain('ACCOUNT_PSEUDONYM_TOMBSTONE = "Usunięty podróżny"');
		expect(constants).toContain('ACCOUNT_MESSAGE_TOMBSTONE = "Wiadomość usunięta."');
		const migration = read("packages/data-ops/src/drizzle/migrations/dev/0009_boring_toxin.sql");
		expect(migration).toContain("interval '24 hours'");
		expect(migration).toContain("interval '31 days'");
		expect(migration).toContain("ON DELETE set null");
		const config = JSON.parse(
			read("apps/data-service/wrangler.jsonc")
				.replace(/\/\*[\s\S]*?\*\//g, "")
				.replace(/^\s*\/\/.*$/gm, ""),
		);
		for (const environment of ["dev", "staging", "production"]) {
			expect(config.env[environment].triggers.crons).toEqual(["*/5 * * * *"]);
		}
		const scheduled = read("apps/data-service/src/scheduled/index.ts");
		expect(scheduled).toContain("purgeExpiredRoomContent");
		expect(scheduled).toContain("LIFECYCLE_CLEANUP_BATCH_SIZE");
		expect(read("packages/data-ops/src/lifecycle/queries.ts")).not.toMatch(
			/destination|placeId|latitude|longitude/i,
		);
	});
});

describe("S8 policy artifact drift", () => {
	it("publishes the exact tested clocks, deletion matrix, rules, and pending-approval status", () => {
		const notice = read("docs/privacy/privacy-notice-pl.md");
		const matrix = read("docs/privacy/retention-account-deletion.md");
		const rules = read(`docs/privacy/community-rules-${COMMUNITY_RULES_VERSION}.md`);
		const release = read("docs/privacy/production-release-status.md");
		expect(`${notice}\n${matrix}`).toContain("24 godzin");
		expect(`${notice}\n${matrix}`).toContain("30 dni");
		expect(`${notice}\n${matrix}`).toContain("5 minut");
		expect(matrix).toContain("100 pokojów");
		expect(matrix).toContain("co 5 minut");
		expect(matrix).toContain("snapshot");
		expect(matrix).toContain("zgod");
		expect(notice).toContain("kopii");
		expect(notice).toContain("dostawc");
		expect(release).toContain(STATUS);
		expect(notice).toContain(STATUS);
		expect(matrix).toContain(STATUS);
		expect(rules).toContain(COMMUNITY_RULES_VERSION);
		for (const topic of COMMUNITY_RULES_TOPICS) expect(rules).toContain(topic);
	});
});
