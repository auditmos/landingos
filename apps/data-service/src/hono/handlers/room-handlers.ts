import { getAuth } from "@repo/data-ops/auth/server";
import type { RoomAccessContext } from "@repo/data-ops/room";
import {
	RoomIdSchema,
	RoomJoinRequestSchema,
	RoomMessageCreateRequestSchema,
	RoomSelectionUpdateRequestSchema,
} from "@repo/data-ops/room";
import { COMMUNITY_RULES_VERSION } from "@repo/data-ops/safety";
import { Hono } from "hono";
import { createDatabaseAnalyticsTracker } from "../../analytics/repository";
import {
	ANALYTICS_FUNNEL_HEADER,
	type AnalyticsTracker,
	readRequestedFunnelId,
	roomOccupancyBucket,
} from "../../analytics/service";
import {
	ROOM_CLOSES_AT_HEADER,
	ROOM_ID_HEADER,
	ROOM_RULES_VERSION_HEADER,
	ROOM_USER_ID_HEADER,
} from "../../durable-objects/flight-room";
import { createDatabaseFlightRoomService } from "../../room/repository";
import { type FlightRoomService, FlightRoomServiceError } from "../../room/service";
import {
	type GetUserSession,
	requireUser,
	sessionUserId,
	type UserSession,
	type UserVariables,
} from "../middleware/session-auth";
import { invalidRoomId, serviceErrorResponder, UNAUTHORIZED_BODY } from "../utils/api-errors";
import { parseJsonBody } from "../utils/request-body";

export interface RoomHandlerDependencies {
	createService(env: Env): FlightRoomService;
	createAnalyticsTracker(env: Env): AnalyticsTracker;
	getSession: GetUserSession;
	openSocket(
		access: RoomAccessContext,
		request: Request,
		rulesAccepted: boolean,
		env?: Env,
	): Promise<Response>;
}

const defaultDependencies: RoomHandlerDependencies = {
	createService: createDatabaseFlightRoomService,
	createAnalyticsTracker: createDatabaseAnalyticsTracker,
	getSession: async (request) =>
		(await getAuth().api.getSession({ headers: request.headers })) as UserSession,
	openSocket: async (access, _request, rulesAccepted, env) => {
		if (!env) {
			throw new Error("Brak środowiska Workera dla połączenia pokoju.");
		}
		const headers = new Headers({
			Upgrade: "websocket",
			[ROOM_ID_HEADER]: access.room.id,
			[ROOM_USER_ID_HEADER]: access.userId,
			[ROOM_CLOSES_AT_HEADER]: access.room.closesAt,
		});
		if (rulesAccepted) {
			headers.set(ROOM_RULES_VERSION_HEADER, COMMUNITY_RULES_VERSION);
		}
		return env.FLIGHT_ROOM.getByName(access.coordinatorKey).fetch(
			new Request("https://flight-room.internal/connect", { headers }),
		);
	},
};

const serviceError = serviceErrorResponder(FlightRoomServiceError);

export function createRoomHandlers(dependencies: RoomHandlerDependencies = defaultDependencies) {
	const rooms = new Hono<{ Bindings: Env; Variables: UserVariables }>();
	const authenticated = requireUser({ getSession: dependencies.getSession });

	rooms.get("/", authenticated, async (c) => {
		return c.json(await dependencies.createService(c.env).list(c.get("userId")));
	});

	// Registered before "/:roomId" so the static segment wins the route match.
	rooms.get("/past", authenticated, async (c) => {
		return c.json(await dependencies.createService(c.env).listPast(c.get("userId")));
	});

	rooms.post("/join", authenticated, async (c) => {
		const userId = c.get("userId");
		const body = await parseJsonBody(c, RoomJoinRequestSchema, undefined);
		if (!body.ok) {
			return c.json({ code: "ROOM_JOIN_INVALID", error: "Wybierz rozpoznany lot." }, 400);
		}
		try {
			const snapshot = await dependencies
				.createService(c.env)
				.join(body.data.flightInstanceId, userId);
			const funnelId = await dependencies
				.createAnalyticsTracker(c.env)
				.track(readRequestedFunnelId(c.req.raw), {
					eventName: "room_joined",
					userId,
					roomOccupancyBucket: roomOccupancyBucket(snapshot.members.length),
				});
			c.header(ANALYTICS_FUNNEL_HEADER, funnelId);
			return c.json(snapshot);
		} catch (error) {
			return serviceError(c, error);
		}
	});

	rooms.get("/:roomId", authenticated, async (c) => {
		const roomId = RoomIdSchema.safeParse(c.req.param("roomId"));
		if (!roomId.success) return invalidRoomId(c);
		try {
			return c.json(
				await dependencies.createService(c.env).getSnapshot(roomId.data, c.get("userId")),
			);
		} catch (error) {
			return serviceError(c, error);
		}
	});

	rooms.put("/:roomId/selection", authenticated, async (c) => {
		const userId = c.get("userId");
		const roomId = RoomIdSchema.safeParse(c.req.param("roomId"));
		if (!roomId.success) return invalidRoomId(c);
		const body = await parseJsonBody(c, RoomSelectionUpdateRequestSchema, undefined);
		if (!body.ok) {
			return c.json(
				{ code: "ROOM_SELECTION_INVALID", error: "Nieprawidłowy wybór transportu." },
				400,
			);
		}
		try {
			const member = await dependencies
				.createService(c.env)
				.replaceSelection(roomId.data, userId, body.data.selection);
			const funnelId = await dependencies
				.createAnalyticsTracker(c.env)
				.track(readRequestedFunnelId(c.req.raw), {
					eventName: "transport_selected",
					userId,
					transportKind: body.data.selection.kind,
				});
			c.header(ANALYTICS_FUNNEL_HEADER, funnelId);
			return c.json(member);
		} catch (error) {
			return serviceError(c, error);
		}
	});

	rooms.post("/:roomId/messages", authenticated, async (c) => {
		const userId = c.get("userId");
		const roomId = RoomIdSchema.safeParse(c.req.param("roomId"));
		if (!roomId.success) return invalidRoomId(c);
		const body = await parseJsonBody(c, RoomMessageCreateRequestSchema, undefined);
		if (!body.ok) {
			return c.json(
				{
					code: "ROOM_MESSAGE_INVALID",
					// Only a field-level issue carries Polish copy. Zod's top-level
					// "expected object, received undefined" — what an unparsable body
					// produces — is English, so it must never reach the wire.
					error:
						body.error.issues.find((issue) => issue.path.length > 0)?.message ??
						"Nieprawidłowa wiadomość.",
				},
				400,
			);
		}
		try {
			const result = await dependencies
				.createService(c.env)
				.createMessage(roomId.data, userId, body.data);
			const funnelId = await dependencies
				.createAnalyticsTracker(c.env)
				.track(readRequestedFunnelId(c.req.raw), {
					eventName: "chat_activated",
					userId,
				});
			c.header(ANALYTICS_FUNNEL_HEADER, funnelId);
			return c.json(result, result.created ? 201 : 200);
		} catch (error) {
			return serviceError(c, error);
		}
	});

	rooms.post("/:roomId/tickets", authenticated, async (c) => {
		const roomId = RoomIdSchema.safeParse(c.req.param("roomId"));
		if (!roomId.success) return invalidRoomId(c);
		try {
			return c.json(
				await dependencies.createService(c.env).issueTicket(roomId.data, c.get("userId")),
				201,
			);
		} catch (error) {
			return serviceError(c, error);
		}
	});

	rooms.get("/:roomId/connect", async (c) => {
		if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
			return c.json(
				{ code: "WEBSOCKET_REQUIRED", error: "Wymagane jest połączenie WebSocket." },
				426,
			);
		}
		const roomId = RoomIdSchema.safeParse(c.req.param("roomId"));
		if (!roomId.success) return invalidRoomId(c);
		try {
			const service = dependencies.createService(c.env);
			const ticket = c.req.query("ticket");
			let access: RoomAccessContext | null = null;
			if (ticket) {
				access = await service.authenticateTicket(roomId.data, ticket);
			} else {
				if (!c.req.header("Authorization")?.startsWith("Bearer ")) {
					return c.json(UNAUTHORIZED_BODY, 401);
				}
				const userId = await sessionUserId(dependencies.getSession, c.req.raw);
				if (!userId) return c.json(UNAUTHORIZED_BODY, 401);
				access = await service.authenticateUser(roomId.data, userId);
			}
			if (!access) return c.json(UNAUTHORIZED_BODY, 401);
			const rulesAccepted = await service.hasAcceptedCurrentRules(access.userId);
			return dependencies.openSocket(access, c.req.raw, rulesAccepted, c.env);
		} catch (error) {
			return serviceError(c, error);
		}
	});

	return rooms;
}

export default createRoomHandlers();
