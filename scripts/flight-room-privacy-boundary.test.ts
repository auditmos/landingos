import { describe, expect, it } from "vitest";
import { isRuntimeSource, matching, source as read, scanFiles } from "./leak-scan";

/** Room feature directories, swept whole — a new room file is scanned automatically. */
const ROOM_DIRECTORIES = [
	"packages/data-ops/src/room",
	"apps/data-service/src/room",
	"apps/data-service/src/durable-objects",
	"apps/user-application/src/components/room",
] as const;

/** Shared directories, narrowed to the files that carry room traffic. */
const SHARED_DIRECTORIES = [
	"apps/data-service/src/hono/handlers",
	"apps/user-application/src/lib",
] as const;
const ROOM_FILE = /room/i;

/**
 * Files swept in that legitimately carry a forbidden token, each named on
 * purpose. `private-drop-off.ts` is the browser-local store for the traveler's
 * own destination label and maps link — it never crosses into a room payload,
 * which `room-intent.ts` and the room schemas are scanned to prove.
 */
const ALLOWLIST = ["apps/user-application/src/lib/private-drop-off.ts"] as const;

const runtimeFiles = [
	...scanFiles(ROOM_DIRECTORIES, { include: isRuntimeSource, allowlist: ALLOWLIST }),
	...scanFiles(SHARED_DIRECTORIES, {
		include: (path) => isRuntimeSource(path) && ROOM_FILE.test(path),
		allowlist: ALLOWLIST,
	}),
];

describe("flight room privacy and scope boundary", () => {
	it("has no exact destination, contact, or provider payload fields in room runtime contracts", () => {
		expect(runtimeFiles.length).toBeGreaterThan(0);
		expect(
			matching(
				runtimeFiles,
				/\b(email|destination|placeId|coordinates|latitude|longitude|providerPayload)\b/,
			),
		).toEqual([]);
	});

	it("has no commercial transaction or exact meeting fields in room runtime contracts", () => {
		expect(
			matching(
				runtimeFiles,
				/\b(payment|fareSplit|taxiOrder|settlement|booking|meetingAddress|fareMinor|costMinor)\b/i,
			),
		).toEqual([]);
	});

	it("does not log room payloads or use insecure randomness", () => {
		expect(matching(runtimeFiles, /\bconsole\.(?:log|info|warn|error)\b/)).toEqual([]);
		expect(matching(runtimeFiles, /Math\.random/)).toEqual([]);
	});

	it("uses Durable Object storage only to schedule room closure", () => {
		const durableObject = read("apps/data-service/src/durable-objects/flight-room.ts");
		expect(durableObject.match(/\bthis\.ctx\.storage\.setAlarm\(/g)).toHaveLength(1);
		expect(durableObject.replace("this.ctx.storage.setAlarm(", "")).not.toMatch(
			/\b(?:ctx|this\.ctx)\.storage\b/,
		);
		expect(durableObject).toContain("acceptWebSocket");
		expect(durableObject).toContain("serializeAttachment");
		expect(durableObject).toContain("deserializeAttachment");
	});

	it("documents the accepted trust limitation in Polish UI copy", () => {
		const component = read("apps/user-application/src/components/room/flight-room.tsx");
		expect(component).toContain("nie sprawdza karty pokładowej");
	});
});
