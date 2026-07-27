import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeFiles = [
	"packages/data-ops/src/room/schema.ts",
	"packages/data-ops/src/room/table.ts",
	"packages/data-ops/src/room/queries.ts",
	"apps/data-service/src/room/service.ts",
	"apps/data-service/src/room/repository.ts",
	"apps/data-service/src/durable-objects/flight-room.ts",
	"apps/data-service/src/hono/handlers/room-handlers.ts",
	"apps/user-application/src/lib/room-intent.ts",
	"apps/user-application/src/lib/room-api.ts",
	"apps/user-application/src/components/room/flight-room.tsx",
] as const;

const source = runtimeFiles.map((path) => readFileSync(path, "utf8")).join("\n");

describe("flight room privacy and scope boundary", () => {
	it("has no exact destination, contact, or provider payload fields in room runtime contracts", () => {
		expect(source).not.toMatch(
			/\b(email|destination|placeId|coordinates|latitude|longitude|providerPayload)\b/,
		);
	});

	it("has no commercial transaction or exact meeting fields in room runtime contracts", () => {
		expect(source).not.toMatch(
			/\b(payment|fareSplit|taxiOrder|settlement|booking|meetingAddress|fareMinor|costMinor)\b/i,
		);
	});

	it("does not log room payloads or use insecure randomness", () => {
		expect(source).not.toMatch(/\bconsole\.(?:log|info|warn|error)\b/);
		expect(source).not.toContain("Math.random");
	});

	it("keeps Durable Object storage out of the authoritative room path", () => {
		const durableObject = readFileSync(
			"apps/data-service/src/durable-objects/flight-room.ts",
			"utf8",
		);
		expect(durableObject).not.toMatch(/\b(?:ctx|this\.ctx)\.storage\b/);
		expect(durableObject).toContain("acceptWebSocket");
		expect(durableObject).toContain("serializeAttachment");
		expect(durableObject).toContain("deserializeAttachment");
	});

	it("documents the accepted trust limitation in Polish UI copy", () => {
		const component = readFileSync(
			"apps/user-application/src/components/room/flight-room.tsx",
			"utf8",
		);
		expect(component).toContain("nie sprawdza karty pokładowej");
	});
});
