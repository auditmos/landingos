import {
	ANALYTICS_FUNNEL_HEADER,
	type AnalyticsEventName,
	FunnelIdSchema,
	type RoomOccupancyBucket,
	type TransportKind,
} from "@repo/data-ops/analytics";

export { ANALYTICS_FUNNEL_HEADER };

type TrackableEvent = Exclude<AnalyticsEventName, "funnel_started" | "funnel_abandoned">;

type AnalyticsTrackRequest =
	| { eventName: "flight_recognized" | "recommendations_viewed" }
	| {
			eventName: "transport_selected";
			userId: string;
			transportKind: TransportKind;
	  }
	| {
			eventName: "room_joined";
			userId: string;
			roomOccupancyBucket: RoomOccupancyBucket;
	  }
	| { eventName: "chat_activated"; userId: string };

export class AnalyticsConfigurationError extends Error {
	constructor() {
		super("Brak serwerowego sekretu pseudonimizacji analitycznej.");
		this.name = "AnalyticsConfigurationError";
	}
}

export interface AnalyticsTrackerDependencies {
	now(): Date;
	secret?: string;
	ensureActiveFunnel(input: { requestedFunnelId?: string; now: Date }): Promise<{
		funnelId: string;
		created: boolean;
		replacedFunnelId?: string;
	}>;
	recordEvent(input: {
		requestedFunnelId?: string;
		eventName: TrackableEvent;
		actorPseudonym?: string;
		transportKind?: TransportKind;
		roomOccupancyBucket?: RoomOccupancyBucket;
		now: Date;
	}): Promise<{
		funnelId: string;
		eventCreated: boolean;
		replacedFunnelId?: string;
	}>;
}

function hex(bytes: ArrayBuffer): string {
	return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function actorPseudonymForUser(userId: string, secret: string): Promise<string> {
	if (Array.from(secret).length < 32) throw new AnalyticsConfigurationError();
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(userId)));
}

export function readRequestedFunnelId(request: Request): string | undefined {
	const parsed = FunnelIdSchema.safeParse(request.headers.get(ANALYTICS_FUNNEL_HEADER));
	return parsed.success ? parsed.data : undefined;
}

export function roomOccupancyBucket(count: number): RoomOccupancyBucket {
	if (!Number.isInteger(count) || count < 1) {
		throw new RangeError("Liczba osób w pokoju musi być dodatnią liczbą całkowitą.");
	}
	if (count <= 1) return "one";
	if (count <= 5) return "two_to_five";
	return "six_plus";
}

export function createAnalyticsTracker(dependencies: AnalyticsTrackerDependencies) {
	return {
		async begin(requestedFunnelId?: string): Promise<string> {
			return (
				await dependencies.ensureActiveFunnel({
					requestedFunnelId,
					now: dependencies.now(),
				})
			).funnelId;
		},

		async track(requestedFunnelId: string | undefined, request: AnalyticsTrackRequest) {
			const userId = "userId" in request ? request.userId : undefined;
			const actorPseudonym = userId
				? await actorPseudonymForUser(userId, dependencies.secret ?? "")
				: undefined;
			const result = await dependencies.recordEvent({
				requestedFunnelId,
				eventName: request.eventName,
				actorPseudonym,
				...("transportKind" in request ? { transportKind: request.transportKind } : {}),
				...("roomOccupancyBucket" in request
					? { roomOccupancyBucket: request.roomOccupancyBucket }
					: {}),
				now: dependencies.now(),
			});
			return result.funnelId;
		},
	};
}

export type AnalyticsTracker = ReturnType<typeof createAnalyticsTracker>;
