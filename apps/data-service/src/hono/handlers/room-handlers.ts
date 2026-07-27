import { getAuth } from "@repo/data-ops/auth/server";
import type { RoomAccessContext } from "@repo/data-ops/room";
import {
	RoomIdSchema,
	RoomJoinRequestSchema,
	RoomMessageCreateRequestSchema,
	RoomSelectionUpdateRequestSchema,
} from "@repo/data-ops/room";
import { COMMUNITY_RULES_VERSION } from "@repo/data-ops/safety";
import type { Context } from "hono";
import { Hono } from "hono";
import {
	ROOM_ID_HEADER,
	ROOM_RULES_VERSION_HEADER,
	ROOM_USER_ID_HEADER,
} from "../../durable-objects/flight-room";
import { createDatabaseFlightRoomService } from "../../room/repository";
import { type FlightRoomService, FlightRoomServiceError } from "../../room/service";

interface RoomSession {
	user?: { id?: string | null } | null;
}

export interface RoomHandlerDependencies {
	createService(env: Env): FlightRoomService;
	getSession(request: Request): Promise<RoomSession | null>;
	openSocket(
		access: RoomAccessContext,
		request: Request,
		rulesAccepted: boolean,
		env?: Env,
	): Promise<Response>;
}

const defaultDependencies: RoomHandlerDependencies = {
	createService: createDatabaseFlightRoomService,
	getSession: async (request) =>
		(await getAuth().api.getSession({ headers: request.headers })) as RoomSession | null,
	openSocket: async (access, _request, rulesAccepted, env) => {
		if (!env) {
			throw new Error("Brak środowiska Workera dla połączenia pokoju.");
		}
		const headers = new Headers({
			Upgrade: "websocket",
			[ROOM_ID_HEADER]: access.room.id,
			[ROOM_USER_ID_HEADER]: access.userId,
		});
		if (rulesAccepted) {
			headers.set(ROOM_RULES_VERSION_HEADER, COMMUNITY_RULES_VERSION);
		}
		return env.FLIGHT_ROOM.getByName(access.coordinatorKey).fetch(
			new Request("https://flight-room.internal/connect", { headers }),
		);
	},
};

function unauthorized(c: Context) {
	return c.json({ code: "UNAUTHORIZED", error: "Wymagane jest zalogowanie." }, 401);
}

async function currentUserId(
	request: Request,
	dependencies: RoomHandlerDependencies,
): Promise<string | null> {
	try {
		return (await dependencies.getSession(request))?.user?.id ?? null;
	} catch {
		return null;
	}
}

function serviceError(c: Context, error: unknown) {
	if (!(error instanceof FlightRoomServiceError)) throw error;
	return c.json({ code: error.code, error: error.message }, error.status);
}

function invalidRoom(c: Context) {
	return c.json({ code: "ROOM_ID_INVALID", error: "Nieprawidłowy identyfikator pokoju." }, 400);
}

export function createRoomHandlers(dependencies: RoomHandlerDependencies = defaultDependencies) {
	const rooms = new Hono<{ Bindings: Env }>();

	rooms.post("/join", async (c) => {
		const userId = await currentUserId(c.req.raw, dependencies);
		if (!userId) return unauthorized(c);
		const parsed = RoomJoinRequestSchema.safeParse(await c.req.json().catch(() => undefined));
		if (!parsed.success) {
			return c.json({ code: "ROOM_JOIN_INVALID", error: "Wybierz rozpoznany lot." }, 400);
		}
		try {
			return c.json(
				await dependencies.createService(c.env).join(parsed.data.flightInstanceId, userId),
			);
		} catch (error) {
			return serviceError(c, error);
		}
	});

	rooms.get("/:roomId", async (c) => {
		const userId = await currentUserId(c.req.raw, dependencies);
		if (!userId) return unauthorized(c);
		const roomId = RoomIdSchema.safeParse(c.req.param("roomId"));
		if (!roomId.success) return invalidRoom(c);
		try {
			return c.json(await dependencies.createService(c.env).getSnapshot(roomId.data, userId));
		} catch (error) {
			return serviceError(c, error);
		}
	});

	rooms.put("/:roomId/selection", async (c) => {
		const userId = await currentUserId(c.req.raw, dependencies);
		if (!userId) return unauthorized(c);
		const roomId = RoomIdSchema.safeParse(c.req.param("roomId"));
		if (!roomId.success) return invalidRoom(c);
		const parsed = RoomSelectionUpdateRequestSchema.safeParse(
			await c.req.json().catch(() => undefined),
		);
		if (!parsed.success) {
			return c.json(
				{ code: "ROOM_SELECTION_INVALID", error: "Nieprawidłowy wybór transportu." },
				400,
			);
		}
		try {
			return c.json(
				await dependencies
					.createService(c.env)
					.replaceSelection(roomId.data, userId, parsed.data.selection),
			);
		} catch (error) {
			return serviceError(c, error);
		}
	});

	rooms.post("/:roomId/messages", async (c) => {
		const userId = await currentUserId(c.req.raw, dependencies);
		if (!userId) return unauthorized(c);
		const roomId = RoomIdSchema.safeParse(c.req.param("roomId"));
		if (!roomId.success) return invalidRoom(c);
		const parsed = RoomMessageCreateRequestSchema.safeParse(
			await c.req.json().catch(() => undefined),
		);
		if (!parsed.success) {
			return c.json(
				{
					code: "ROOM_MESSAGE_INVALID",
					error: parsed.error.issues[0]?.message ?? "Nieprawidłowa wiadomość.",
				},
				400,
			);
		}
		try {
			const result = await dependencies
				.createService(c.env)
				.createMessage(roomId.data, userId, parsed.data);
			return c.json(result, result.created ? 201 : 200);
		} catch (error) {
			return serviceError(c, error);
		}
	});

	rooms.post("/:roomId/tickets", async (c) => {
		const userId = await currentUserId(c.req.raw, dependencies);
		if (!userId) return unauthorized(c);
		const roomId = RoomIdSchema.safeParse(c.req.param("roomId"));
		if (!roomId.success) return invalidRoom(c);
		try {
			return c.json(await dependencies.createService(c.env).issueTicket(roomId.data, userId), 201);
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
		if (!roomId.success) return invalidRoom(c);
		const service = dependencies.createService(c.env);
		const ticket = c.req.query("ticket");
		let access: RoomAccessContext | null = null;
		if (ticket) {
			access = await service.authenticateTicket(roomId.data, ticket);
		} else {
			if (!c.req.header("Authorization")?.startsWith("Bearer ")) return unauthorized(c);
			const userId = await currentUserId(c.req.raw, dependencies);
			if (!userId) return unauthorized(c);
			access = await service.authenticateUser(roomId.data, userId);
		}
		if (!access) return unauthorized(c);
		const rulesAccepted = await service.hasAcceptedCurrentRules(access.userId);
		return dependencies.openSocket(access, c.req.raw, rulesAccepted, c.env);
	});

	return rooms;
}

export default createRoomHandlers();
