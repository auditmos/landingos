import {
	ActorPseudonymSchema,
	ANALYTICS_EVENT_NAMES,
	ANALYTICS_SCHEMA_VERSION,
	AnalyticsEventSchema,
	FunnelIdSchema,
	RoomOccupancyBucketSchema,
	TransportKindSchema,
} from "./schema";

const event = {
	eventName: "transport_selected",
	eventTime: "2026-09-14T07:03:00.000Z",
	funnelId: "00112233445566778899aabbccddeeff",
	actorPseudonym: "a".repeat(64),
	lastCompletedStep: "transport_selected",
	transportKind: "public_transport",
	roomOccupancyBucket: null,
	schemaVersion: "2026-07-27-v1",
} as const;

describe("strict analytics event contract", () => {
	it("locks the seven event names, schema version, and exact event columns", () => {
		expect(ANALYTICS_EVENT_NAMES).toEqual([
			"funnel_started",
			"flight_recognized",
			"recommendations_viewed",
			"transport_selected",
			"room_joined",
			"chat_activated",
			"funnel_abandoned",
		]);
		expect(ANALYTICS_SCHEMA_VERSION).toBe("2026-07-27-v1");
		expect(Object.keys(AnalyticsEventSchema.parse(event))).toEqual([
			"eventName",
			"eventTime",
			"funnelId",
			"actorPseudonym",
			"lastCompletedStep",
			"transportKind",
			"roomOccupancyBucket",
			"schemaVersion",
		]);
	});

	it("rejects arbitrary metadata and every forbidden canary field", () => {
		for (const forbidden of [
			"email",
			"userId",
			"ipAddress",
			"userAgent",
			"address",
			"placeId",
			"coordinates",
			"routeSteps",
			"displayPseudonym",
			"messageContent",
			"metadata",
		]) {
			expect(AnalyticsEventSchema.safeParse({ ...event, [forbidden]: "CANARY" }).success).toBe(
				false,
			);
		}
	});

	it("enforces 128-bit funnel IDs, HMAC digests, occupancy buckets, and transport enum", () => {
		expect(FunnelIdSchema.safeParse("0".repeat(32)).success).toBe(true);
		expect(FunnelIdSchema.safeParse("0".repeat(31)).success).toBe(false);
		expect(FunnelIdSchema.safeParse(`${"0".repeat(31)}g`).success).toBe(false);
		expect(ActorPseudonymSchema.safeParse("a".repeat(64)).success).toBe(true);
		expect(ActorPseudonymSchema.safeParse("a".repeat(63)).success).toBe(false);
		expect(TransportKindSchema.options).toEqual(["public_transport", "shared_taxi"]);
		expect(RoomOccupancyBucketSchema.options).toEqual(["one", "two_to_five", "six_plus"]);
	});
});
