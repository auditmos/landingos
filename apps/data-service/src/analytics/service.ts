import {
	ANALYTICS_FUNNEL_HEADER,
	type AnalyticsEventInput,
	FunnelIdSchema,
	type RoomOccupancyBucket,
} from "@repo/data-ops/analytics";

export { ANALYTICS_FUNNEL_HEADER };

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
	recordEvent(input: AnalyticsEventInput & { requestedFunnelId?: string; now: Date }): Promise<{
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

/**
 * Exchanges the raw user id for its HMAC pseudonym. The variant is rebuilt rather than
 * spread, so the raw id has no path into a recorded event.
 */
async function withActorPseudonym(
	request: AnalyticsEventInput<"userId">,
	secret: string | undefined,
): Promise<AnalyticsEventInput> {
	if (request.eventName === "flight_recognized" || request.eventName === "recommendations_viewed") {
		return { eventName: request.eventName };
	}
	const actorPseudonym = await actorPseudonymForUser(request.userId, secret ?? "");
	if (request.eventName === "transport_selected") {
		return { eventName: request.eventName, actorPseudonym, transportKind: request.transportKind };
	}
	if (request.eventName === "room_joined") {
		return {
			eventName: request.eventName,
			actorPseudonym,
			roomOccupancyBucket: request.roomOccupancyBucket,
		};
	}
	return { eventName: request.eventName, actorPseudonym };
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

		async track(requestedFunnelId: string | undefined, request: AnalyticsEventInput<"userId">) {
			const result = await dependencies.recordEvent({
				...(await withActorPseudonym(request, dependencies.secret)),
				requestedFunnelId,
				now: dependencies.now(),
			});
			return result.funnelId;
		},
	};
}

export type AnalyticsTracker = ReturnType<typeof createAnalyticsTracker>;
