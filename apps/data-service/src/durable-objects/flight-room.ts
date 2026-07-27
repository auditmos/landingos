import { DurableObject } from "cloudflare:workers";
import {
	ConnectionAttachmentSchema,
	RoomIdSchema,
	RoomRealtimeErrorSchema,
	type RoomRealtimeEvent,
	RoomRealtimeEventSchema,
} from "@repo/data-ops/room";

export const ROOM_ID_HEADER = "X-LandingOS-Room-Id";
export const ROOM_USER_ID_HEADER = "X-LandingOS-User-Id";

function errorPayload(code: "BINARY_MESSAGE_NOT_SUPPORTED" | "MESSAGE_TRANSPORT_NOT_SUPPORTED") {
	return RoomRealtimeErrorSchema.parse(
		code === "BINARY_MESSAGE_NOT_SUPPORTED"
			? {
					type: "error",
					code,
					error: "Wiadomość musi być zwykłym tekstem.",
				}
			: {
					type: "error",
					code,
					error: "Wiadomości wysyłaj przez bezpieczny formularz pokoju.",
				},
	);
}

export class FlightRoomDurableObject extends DurableObject<Env> {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
			return new Response("Wymagane jest połączenie WebSocket.", { status: 426 });
		}
		const attachment = ConnectionAttachmentSchema.safeParse({
			roomId: request.headers.get(ROOM_ID_HEADER),
			userId: request.headers.get(ROOM_USER_ID_HEADER),
		});
		if (!attachment.success) {
			return new Response("Brak prawidłowego kontekstu autoryzacji pokoju.", { status: 403 });
		}

		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];
		this.ctx.acceptWebSocket(server, [attachment.data.roomId]);
		server.serializeAttachment(attachment.data);
		return new Response(null, { status: 101, webSocket: client });
	}

	async broadcast(roomId: string, rawEvent: RoomRealtimeEvent): Promise<void> {
		const expectedRoomId = RoomIdSchema.parse(roomId);
		const event = RoomRealtimeEventSchema.parse(rawEvent);
		const payload = JSON.stringify(event);
		for (const socket of this.ctx.getWebSockets(expectedRoomId)) {
			const attachment = ConnectionAttachmentSchema.safeParse(socket.deserializeAttachment());
			if (!attachment.success || attachment.data.roomId !== expectedRoomId) {
				socket.close(1008, "Nieprawidłowy kontekst pokoju.");
				continue;
			}
			if (socket.readyState === WebSocket.OPEN) {
				socket.send(payload);
			}
		}
	}

	webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
		const attachment = ConnectionAttachmentSchema.safeParse(socket.deserializeAttachment());
		if (!attachment.success) {
			socket.close(1008, "Nieprawidłowy kontekst autoryzacji.");
			return;
		}
		const error =
			typeof message === "string"
				? errorPayload("MESSAGE_TRANSPORT_NOT_SUPPORTED")
				: errorPayload("BINARY_MESSAGE_NOT_SUPPORTED");
		socket.send(JSON.stringify(error));
	}

	webSocketClose(_socket: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
		// The 2026-05-25 compatibility date enables the runtime's automatic close reply.
	}

	webSocketError(socket: WebSocket): void {
		socket.close(1011, "Błąd połączenia pokoju.");
	}
}
