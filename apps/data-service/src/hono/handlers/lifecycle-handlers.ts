import { AccountRedactionRequestSchema } from "@repo/data-ops/lifecycle";
import { RoomRedactedEventSchema } from "@repo/data-ops/room";
import { Hono } from "hono";
import { parseJsonBody } from "../utils/request-body";

export interface LifecycleHandlerDependencies {
	expectedToken(env: Env): string;
	broadcastRedaction(
		env: Env,
		coordinatorKey: string,
		roomId: string,
		event: { type: "room_redacted" },
	): Promise<void>;
}

const defaultDependencies: LifecycleHandlerDependencies = {
	expectedToken: (env) => env.API_TOKEN,
	broadcastRedaction: async (env, coordinatorKey, roomId, event) => {
		await env.FLIGHT_ROOM.getByName(coordinatorKey).broadcast(roomId, event);
	},
};

export function createLifecycleHandlers(
	dependencies: LifecycleHandlerDependencies = defaultDependencies,
) {
	const lifecycle = new Hono<{ Bindings: Env }>();
	lifecycle.post("/redact-rooms", async (c) => {
		const expected = dependencies.expectedToken(c.env);
		if (!expected || c.req.header("Authorization") !== `Bearer ${expected}`) {
			return c.json({ code: "unauthorized", error: "Brak dostępu do operacji wewnętrznej." }, 401);
		}
		const body = await parseJsonBody(c, AccountRedactionRequestSchema, undefined);
		if (!body.ok) {
			return c.json(
				{ code: "lifecycle_request_invalid", error: "Nieprawidłowa lista pokojów." },
				400,
			);
		}
		const event = RoomRedactedEventSchema.parse({ type: "room_redacted" });
		for (const room of body.data.rooms) {
			await dependencies.broadcastRedaction(c.env, room.coordinatorKey, room.roomId, event);
		}
		return c.json({ redactedRooms: body.data.rooms.length });
	});
	return lifecycle;
}

export default createLifecycleHandlers();
