import type { PublicRoomMember, RoomAccessContext, RoomSnapshot } from "@repo/data-ops/room";
import { Hono } from "hono";
import { vi } from "vitest";
import type { AnalyticsTracker } from "../../analytics/service";
import type { FlightRoomService } from "../../room/service";
import { createRoomHandlers } from "./room-handlers";

/**
 * The room router's stubbed world, shared by `room-handlers.test.ts` (the HTTP API)
 * and `room-handlers.socket.test.ts` (the WebSocket authorization matrix). Split out
 * when the combined file passed the repo's 500-line ceiling.
 */
export const FUNNEL_ID = "00112233445566778899aabbccddeeff";

export const room = {
	id: "018f4c8e-5697-7df4-8f6e-c7644b137e5b",
	flightInstanceId: "flight-1",
	closesAt: "2026-09-15T08:20:00.000Z",
};
export const member: PublicRoomMember = {
	pseudonym: "Alicja BGY",
	selection: {
		kind: "public_transport",
		badges: ["recommended"],
		modes: ["bus"],
		operatorNames: ["Airport Bus Express"],
	},
};
export const snapshot: RoomSnapshot = {
	room,
	member,
	members: [member],
	messages: [],
};
export const access: RoomAccessContext = {
	room,
	membershipId: "018f4c8e-5697-7df4-8f6e-c7644b137e51",
	userId: "user-1",
	coordinatorKey: "flight-1",
};
export const pastFlight = {
	flight: {
		id: "flight-0",
		marketingCarrierCode: "FR",
		marketingCarrierName: "Ryanair",
		marketingFlightNumber: "1234",
		operatingCarrierCode: null,
		operatingFlightNumber: null,
		departureLocalDate: "2026-09-01",
		originIata: "WAW",
		destinationIata: "BGY" as const,
		scheduledArrivalUtc: "2026-09-01T08:20:00.000Z",
		displayTimezone: "Europe/Rome" as const,
		source: "provider" as const,
	},
	closedAt: "2026-09-02T08:20:00.000Z",
};

export function buildApp(serviceOverrides: Partial<FlightRoomService> = {}) {
	const service: FlightRoomService = {
		join: vi.fn(async () => snapshot),
		list: vi.fn(async () => [room]),
		listPast: vi.fn(async () => [pastFlight]),
		getSnapshot: vi.fn(async () => snapshot),
		replaceSelection: vi.fn(async (_roomId, _userId, selection) => ({
			...member,
			selection,
		})),
		createMessage: vi.fn(async (_roomId, _userId, input) => ({
			created: true,
			message: {
				id: "018f4c8e-5697-7df4-8f6e-c7644b137e52",
				clientMessageId: input.clientMessageId,
				pseudonym: "Alicja BGY",
				content: input.content,
				createdAt: "2026-09-14T07:00:00.000Z",
			},
		})),
		issueTicket: vi.fn(async () => ({
			ticket: "a".repeat(64),
			expiresAt: "2026-09-14T07:01:00.000Z",
		})),
		authenticateTicket: vi.fn(async () => access),
		authenticateUser: vi.fn(async () => access),
		hasAcceptedCurrentRules: vi.fn(async () => true),
		...serviceOverrides,
	};
	const getSession = vi.fn(async (request: Request) => {
		if (request.headers.get("authorization") === "Bearer native-session") {
			return { user: { id: "user-1" } };
		}
		if (request.headers.get("cookie") === "better-auth.session_token=browser-session") {
			return { user: { id: "user-1" } };
		}
		return null;
	});
	const openSocket = vi.fn(async () => new Response(null, { status: 204 }));
	const analytics: AnalyticsTracker = {
		begin: vi.fn(async () => FUNNEL_ID),
		track: vi.fn(async () => FUNNEL_ID),
	};
	const handlers = createRoomHandlers({
		createService: () => service,
		createAnalyticsTracker: () => analytics,
		getSession,
		openSocket,
	});
	const app = new Hono();
	app.route("/rooms", handlers);
	return { analytics, app, getSession, openSocket, service };
}

export const browserHeaders = {
	"content-type": "application/json",
	cookie: "better-auth.session_token=browser-session",
};
