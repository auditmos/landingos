import {
	type AnalyticsDatabase,
	type AnalyticsEventInput,
	recordAnalyticsEvent,
} from "@repo/data-ops/analytics";
import {
	ANALYTICS_FUNNEL_HEADER,
	AnalyticsConfigurationError,
	type AnalyticsTracker,
	actorPseudonymForUser,
	createAnalyticsTracker,
	readRequestedFunnelId,
	roomOccupancyBucket,
} from "./service";

const ACTOR = "a".repeat(64);
const FUNNEL_A = "00112233445566778899aabbccddeeff";
const FUNNEL_B = "10112233445566778899aabbccddeeff";
const SECRET = "test-only-dedicated-analytics-secret";

function dependencies() {
	return {
		now: () => new Date("2026-09-14T07:00:00.000Z"),
		secret: SECRET,
		ensureActiveFunnel: vi.fn(async () => ({
			funnelId: FUNNEL_A,
			created: false,
			replacedFunnelId: undefined,
		})),
		recordEvent: vi.fn(
			async (input: AnalyticsEventInput & { requestedFunnelId?: string; now: Date }) => ({
				funnelId: input.requestedFunnelId ?? FUNNEL_B,
				eventCreated: true,
				replacedFunnelId: undefined,
			}),
		),
	};
}

/**
 * A type-level contract, not a runtime one: every call below must stay a compile error, so
 * `pnpm run types` — not vitest — is what fails when an impossible combination becomes
 * representable again. Nothing here is executed.
 */
async function impossibleEventCombinations(db: AnalyticsDatabase, tracker: AnalyticsTracker) {
	// @ts-expect-error a room entry must carry its occupancy bucket
	await recordAnalyticsEvent(db, { eventName: "room_joined", actorPseudonym: ACTOR });
	// @ts-expect-error a transport choice must carry its kind
	await recordAnalyticsEvent(db, { eventName: "transport_selected", actorPseudonym: ACTOR });
	// @ts-expect-error an anonymous event must not carry an actor
	await recordAnalyticsEvent(db, { eventName: "flight_recognized", actorPseudonym: ACTOR });
	// @ts-expect-error an authenticated event must carry its actor
	await recordAnalyticsEvent(db, { eventName: "chat_activated" });
	// @ts-expect-error a funnel boundary event is not trackable through this entry point
	await recordAnalyticsEvent(db, { eventName: "funnel_abandoned" });
	// @ts-expect-error the tracker refuses the same impossible combination
	await tracker.track(undefined, { eventName: "room_joined", userId: "raw-user-id" });
}

describe("server-only analytics tracker", () => {
	it("keeps impossible event combinations from compiling", () => {
		expect(impossibleEventCombinations).toBeInstanceOf(Function);
	});

	it("derives deterministic HMAC-SHA-256 actor values without exposing raw IDs", async () => {
		const first = await actorPseudonymForUser("internal-user-123", SECRET);
		const retry = await actorPseudonymForUser("internal-user-123", SECRET);
		const other = await actorPseudonymForUser("internal-user-456", SECRET);
		expect(first).toBe(retry);
		expect(first).toMatch(/^[0-9a-f]{64}$/);
		expect(other).not.toBe(first);
		expect(first).not.toContain("internal-user");
		await expect(actorPseudonymForUser("user", "")).rejects.toBeInstanceOf(
			AnalyticsConfigurationError,
		);
	});

	it("keeps anonymous actor null and hashes authenticated domain events", async () => {
		const deps = dependencies();
		const tracker = createAnalyticsTracker(deps);
		expect(await tracker.begin(FUNNEL_A)).toBe(FUNNEL_A);
		expect(await tracker.track(FUNNEL_A, { eventName: "flight_recognized" })).toBe(FUNNEL_A);
		expect(
			await tracker.track(FUNNEL_A, {
				eventName: "transport_selected",
				userId: "raw-user-id",
				transportKind: "shared_taxi",
			}),
		).toBe(FUNNEL_A);
		expect(deps.recordEvent).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ eventName: "flight_recognized" }),
		);
		// The anonymous variant has no actor field at all, so there is nothing to leave null.
		expect(deps.recordEvent.mock.calls[0]?.[0]).not.toHaveProperty("actorPseudonym");
		expect(deps.recordEvent).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				eventName: "transport_selected",
				actorPseudonym: expect.stringMatching(/^[0-9a-f]{64}$/),
				transportKind: "shared_taxi",
			}),
		);
		expect(JSON.stringify(deps.recordEvent.mock.calls)).not.toContain("raw-user-id");
	});

	it("accepts only valid opaque request headers and fixed occupancy buckets", () => {
		expect(ANALYTICS_FUNNEL_HEADER).toBe("X-LandingOS-Funnel-Id");
		expect(
			readRequestedFunnelId(
				new Request("https://example.test", {
					headers: { [ANALYTICS_FUNNEL_HEADER]: FUNNEL_A },
				}),
			),
		).toBe(FUNNEL_A);
		expect(
			readRequestedFunnelId(
				new Request("https://example.test", {
					headers: { [ANALYTICS_FUNNEL_HEADER]: "email@example.com" },
				}),
			),
		).toBeUndefined();
		expect([1, 2, 5, 6, 100].map(roomOccupancyBucket)).toEqual([
			"one",
			"two_to_five",
			"two_to_five",
			"six_plus",
			"six_plus",
		]);
		expect(() => roomOccupancyBucket(0)).toThrow();
		expect(() => roomOccupancyBucket(2.5)).toThrow();
	});
});
